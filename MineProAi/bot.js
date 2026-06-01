process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const axios = require('axios');
const mcData = require('minecraft-data');
const collectBlock = require('mineflayer-collectblock');
const { Vec3 } = require('vec3');

// ВНИМАНИЕ: Сюда нужно будет вставить твой ключ перед запуском
const AUTH_KEY = 'ВСТАВЬ_СЮДА_СВОЙ_КЛЮЧ_ИЗ_GIGACHAT';

const bot = mineflayer.createBot({
  host: '127.0.0.1', // Адрес сервера
  port: 51116,       // Порт
  username: 'MineProAi',
  version: '1.19.2'
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock.plugin);

let isWorking = false;
let targetBlock = null;
let isBuilding = false;

async function getGigaResponse(message) {
  try {
    const systemPrompt = "Ты игрок в Minecraft. Если тебе дают задачу, отвечай хорошо и выполняй.";
    const tokenResponse = await axios.post('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', 'scope=GIGACHAT_API_PERS', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${AUTH_KEY}`, 'RqUID': '123e4567-e89b-12d3-a456-426614174000' }
    });
    const chatResponse = await axios.post('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
      model: 'GigaChat',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }]
    }, { headers: { 'Authorization': `Bearer ${tokenResponse.data.access_token}`, 'Content-Type': 'application/json' } });
    return chatResponse.data.choices[0].message.content;
  } catch (err) { return "Хорошо, делаю..."; }
}

async function forceChop() {
    const block = bot.findBlock({ matching: (b) => b.name.includes('log'), maxDistance: 32 });
    if (!block) {
        isWorking = false;
        bot.chat("Дерево закончилось!");
        return;
    }
    if (bot.entity.position.distanceTo(block.position) > 3) {
        bot.pathfinder.setGoal(new goals.GoalLookAtBlock(block.position, bot.world));
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    targetBlock = block;
    try {
        await bot.dig(block);
        forceChop(); 
    } catch (err) {
        isWorking = false;
        bot.chat("Не могу рубить.");
    }
}

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;
  const msg = message.toLowerCase();

  if (msg.includes('руби дерево')) {
    isWorking = true;
    forceChop();
    return;
  }

  if (msg.includes('скрафти доски')) {
    const log = bot.inventory.items().find(i => i.name.includes('log'));
    if (!log) { bot.chat("У меня нет дерева."); return; }
    const mcDataInstance = mcData(bot.version);
    const planks = mcDataInstance.itemsByName.oak_planks || mcDataInstance.itemsByName.planks;
    const recipe = bot.recipesFor(planks.id, null, 1, null)[0];
    if (recipe) {
        await bot.craft(recipe, 1, null);
        bot.chat("Скрафтил доски!");
    } else {
        bot.chat("Не могу найти рецепт.");
    }
    return;
  }

  if (msg.includes('строй дом')) {
    const planks = bot.inventory.items().find(i => i.name.includes('plank'));
    if (!planks) { bot.chat("Сначала скрафти доски!"); return; }
    
    isBuilding = true;
    bot.chat("Строю дом!");
    await bot.equip(planks, 'hand');

    const startPos = bot.entity.position.clone();
    
    for (let h = 0; h < 3; h++) {
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const isWall = (x === -1 || x === 1 || z === -1 || z === 1);
                const isDoor = (h === 0 && x === 0 && z === -1);
                
                if (isWall && !isDoor) {
                    const targetPos = startPos.offset(x, h, z);
                    bot.pathfinder.setGoal(new goals.GoalLookAtBlock(targetPos, bot.world));
                    await new Promise(r => setTimeout(r, 800));
                    const refBlock = bot.blockAt(targetPos.offset(0, -1, 0));
                    try {
                        await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
                    } catch (e) {}
                }
            }
        }
    }
    isBuilding = false;
    bot.chat("Дом готов!");
    return;
  }

  if (msg.includes('иди за мной')) {
    const player = bot.players[username];
    if (player && player.entity) {
      bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
    }
    return;
  }

  if (msg.includes('стой')) {
    bot.pathfinder.setGoal(null);
    bot.chat("Стою.");
    return;
  }

  const answer = await getGigaResponse(message);
  bot.chat(answer.substring(0, 256));
});

bot.on('physicsTick', () => {
  if (isBuilding || (isWorking && targetBlock)) return;
  const player = bot.nearestEntity((e) => e.type === 'player' && e.username !== bot.username);
  if (player) bot.lookAt(player.position.offset(0, player.height - 0.2, 0));
});

bot.on('error', (err) => console.log('Ошибка:', err));
bot.on('spawn', () => bot.chat('Привет, я готов к работе!'));
