// Audition inventory. These are proposals mapped to existing UI, not app wiring.
const groups = ['Play & balloons', 'Tokens', 'Streaks & levels', 'Characters', 'Navigation', 'Profile', 'Leaderboard'];
const cues = [];
function cue(id, name, group, recipe, variants, peak, visual, element, trigger, source) {
  cues.push({id, name, group, recipe, variants, peak, visual, element, trigger, source});
}
const play = 'src/app/(tabs)/index.tsx';
const balloon = 'design/characters/balloons.js';
const parts = 'src/components/RoundParts.tsx';
const flight = 'src/components/TokenFlight.tsx';
const progress = 'src/components/LevelChange.tsx';
const streak = 'src/components/StreakTakeover.tsx';
const shop = 'src/components/CharacterShop.tsx';
const profile = 'src/components/Profile.tsx';
const board = 'src/app/(tabs)/leaderboard.tsx';

cue('key', 'Soft key press', groups[0], 'key', 5, -20, 'key', 'Letter keyboard', 'On an accepted key press; light enough for many guesses.', 'src/components/LetterKeyboard.tsx');
cue('correct', 'Letter found', groups[0], 'correct', 3, -13, 'correct', 'Mint letter key', 'A correct guess; use one cue even when the letter occurs several times.', play);
cue('wrong', 'Not that letter', groups[0], 'wrong', 3, -16, 'wrong', 'Grey letter key', 'A wrong guess: a gentle wooden knock before the balloon pops.', play);
cue('tile', 'Tile settles', groups[0], 'tile', 3, -19, 'tile', 'Word tiles', 'A newly revealed letter settles into place; keep below the correct-guess cue.', parts);
cue('deal', 'A new word', groups[0], 'deal', 3, -16, 'tiles', 'Next word', 'Tiles arrive for a new round; also covers the initial word deal.', play);
cue('letters', 'Two letters revealed', groups[0], 'letters', 2, -13, 'gold-tiles', 'Reveal 2 hidden letters', 'The two bought letters appear, alongside the spending sound.', parts);
cue('win', 'Word complete', groups[0], 'win', 2, -10, 'win', 'You saved your character', 'The winning guess; leave room for the selected character to celebrate.', play);
cue('loss', 'A gentle try again', groups[0], 'loss', 2, -14, 'loss', 'Round lost', 'A warm unresolved-to-resolved response after the landing, never an alarm.', play);
cue('stamp', 'Result stamp', groups[0], 'stamp', 3, -12, 'stamp', 'HANGING / DROPPED stamp', 'The result stamp lands: 700 ms after a normal win, 2600 ms after a loss.', 'src/components/GameScene.tsx');
cue('stretch', 'Rubber stretches', groups[0], 'stretch', 3, -21, 'balloon', 'Balloon swell', 'The first 144 ms of an ordinary 900 ms balloon transition.', balloon);
cue('pop', 'Balloon pop', groups[0], 'pop', 5, -10, 'pop', 'One balloon bursts', 'At 16% of a normal transition: 144 ms. Rounded snap, rubber body, air.', balloon);
cue('last-stretch', 'Last balloon strains', groups[0], 'last-stretch', 1, -20, 'balloon', 'Last balloon swell', 'The 352 ms lead-in to the final pop (16% of the 2200 ms fall).', balloon);
cue('last-pop', 'Last balloon pop', groups[0], 'last-pop', 2, -10, 'pop', 'The last balloon', 'At 352 ms in the final transition. A little fuller, without a frightening bang.', balloon);
cue('string', 'Empty string drops', groups[0], 'string', 2, -22, 'string', 'Dangling string', 'The scrap and string droop while the character notices the missing lift.', balloon);
cue('sink', 'Little elastic drop', groups[0], 'sink', 3, -20, 'sink', 'Character sinks', 'After an ordinary pop, the character drops and gently rebounds.', balloon);
cue('fall', 'Falling air', groups[0], 'fall', 2, -16, 'fall', 'The final fall', 'From 836 ms to 1320 ms in the last-balloon animation.', balloon);
cue('impact', 'Cushioned thud', groups[0], 'impact', 3, -9, 'impact', 'Landing on the ground', 'At 1320 ms: round low thump, soft grit, and a springy body. Dazed, never hurt.', balloon);
cue('bounce', 'Small rebound', groups[0], 'bounce', 3, -17, 'bounce', 'Landing bounce', 'The second, smaller contact at about 1584 ms.', balloon);
cue('dust', 'Dust settles', groups[0], 'dust', 2, -23, 'dust', 'Dust and flying clods', 'A quiet supporting layer behind the impact and rebound.', balloon);
cue('stars', 'Seeing little stars', groups[0], 'stars', 2, -20, 'stars', 'Dazed stars', 'One brief orbit after landing; no continuous ringing loop.', balloon);

cue('token-gain', 'Reward appears', groups[1], 'token-gain', 3, -13, 'coin-plus', '+ tokens badge', 'The reward badge appears before its 300 ms hold.', flight);
cue('token-spend', 'Tokens leave the purse', groups[1], 'token-spend', 3, -14, 'coin-minus', 'Paid unlock button', 'A successful spend; distinct from an unaffordable purchase.', 'src/components/PayButton.tsx');
cue('token-flight', 'Coin in flight', groups[1], 'token-flight', 2, -21, 'coin-flight', 'Flying token chip', 'A 620 ms flight. Launch is 540 ms after a gain appears, or 360 ms for a spend.', flight);
cue('token-land', 'Reward lands', groups[1], 'token-land', 3, -12, 'coin-plus', 'Header token counter', 'The flight reaches the counter and the balance begins to change.', 'src/components/TokenPill.tsx');
cue('spend-land', 'Payment settles', groups[1], 'spend-land', 2, -16, 'coin-minus', 'Balance decreases', 'The spending flight reaches the header; a compact, lower coin response.', 'src/components/TokenPill.tsx');
cue('count', 'Counter tick', groups[1], 'count', 5, -23, 'counter', 'Counting balance', 'Supporting ticks during the count, capped to a short burst instead of one per token.', 'src/components/TokenPill.tsx');
cue('refused', 'Not enough tokens', groups[1], 'refused', 2, -17, 'refused', 'Beige purchase button', 'One soft double knock on a refused purchase; no harsh buzzer.', 'src/components/PayButton.tsx');

cue('streak-open', 'Streak opens', groups[2], 'streak-open', 1, -18, 'streak', 'Streak takeover', 'The celebration card enters over the game.', streak);
cue('streak-fill', 'Meter fills', groups[2], 'streak-fill', 2, -18, 'meter', 'Streak progress cell', 'A 620 ms rising texture: 280 ms entrance, then 380 ms waiting, then fill.', streak);
cue('star-land', 'Star clicks home', groups[2], 'star-land', 2, -13, 'star', 'Filled streak cell', 'At the end of the fill, the cell star lands.', streak);
cue('streak-bonus', 'Bonus blooms', groups[2], 'streak-bonus', 2, -10, 'bonus', 'Streak bonus', 'A full meter celebrates 260 ms after the star lands.', streak);
cue('confetti', 'Confetti puff', groups[2], 'confetti', 3, -18, 'confetti', 'Celebration confetti', 'A light paper puff and flutter for streaks, unlocks, and the summit.', 'src/components/Confetti.tsx');
cue('level-rise', 'Climb the path', groups[2], 'level-rise', 1, -18, 'level-up', 'Ascending level marker', '950 ms of travel, after the card waits 450 ms.', progress);
cue('level-slide', 'Slide down the path', groups[2], 'level-slide', 1, -19, 'level-down', 'Descending level marker', '1150 ms of travel; playful and gentle.', progress);
cue('level-up', 'New level reached', groups[2], 'level-up', 2, -10, 'level-up', 'New level stop', 'On landing, with the stop pop and sparkles.', progress);
cue('level-down', 'A softer landing', groups[2], 'level-down', 1, -15, 'level-down', 'Back one level', 'An encouraging settling sound; no failure alarm.', progress);
cue('map-open', 'Unfold the world', groups[2], 'map-open', 2, -18, 'map', 'Level map', 'Tap the level pill to open the map.', 'src/components/LevelMap.tsx');
cue('map-close', 'Fold the world', groups[2], 'map-close', 2, -20, 'map', 'Close level map', 'The map closes with a short soft sweep.', 'src/components/LevelMap.tsx');
cue('fog', 'Clouds part', groups[2], 'fog', 1, -20, 'cloud', 'Summit fog', 'A 700 ms airy reveal as the fog lifts from the castle.', progress);
cue('summit', 'The whole sky opens', groups[2], 'summit', 1, -9, 'crown', 'Top level reached', 'The largest musical reward in the set; reserved for reaching the summit.', progress);
cue('crown', 'Crown settles', groups[2], 'crown', 2, -15, 'crown', 'Crown on the character', 'A small golden contact after the summit reveal.', progress);

cue('browse', 'Meet the next character', groups[3], 'browse', 3, -18, 'character', 'Shop arrows and cards', 'The viewed character changes; a short swish without speaking on every fast swipe.', shop);
cue('choose', 'Character chosen', groups[3], 'choose', 2, -14, 'character', 'Choose character', 'A confident little confirmation, with that character’s greeting.', 'src/app/(tabs)/characters.tsx');
cue('latch', 'Lock opens', groups[3], 'latch', 3, -14, 'lock', 'Character unlock', 'The lock releases after a successful purchase.', shop);
cue('unlock', 'Welcome to the collection', groups[3], 'unlock', 2, -10, 'character', 'New character unlocked', 'A joyful reveal under the character’s voice and confetti.', shop);
cue('ribbon', 'Welcome ribbon', groups[3], 'ribbon', 2, -20, 'ribbon', 'Unlocked ribbon', 'A soft ribbon flick as the banner settles.', shop);

cue('tap', 'Soft button', groups[4], 'tap', 4, -20, 'button', 'Secondary buttons', 'An accepted ordinary button press. Avoid layering it under another dedicated cue.', 'src/components/Raised.tsx');
cue('primary', 'Raised button press', groups[4], 'primary', 3, -17, 'primary', 'Primary action', 'A deeper tactile press for Next word, Play, and other prominent actions.', parts);
cue('tab', 'Change tab', groups[4], 'tab', 3, -19, 'tabs', 'Play / Leaderboard / Characters', 'Only when changing to a different enabled tab.', 'src/components/TabBar.tsx');
cue('back', 'Back one page', groups[4], 'back', 2, -20, 'back', 'Back arrow', 'Back navigation, including Profile and info pages.', 'src/components/GameHeader.tsx');
cue('panel-open', 'Open a panel', groups[4], 'panel-open', 2, -20, 'panel', 'Avatar and info rows', 'Profile, game rules, privacy, terms, support, and credits open.', 'src/components/GameHeader.tsx; src/app/profile.tsx');
cue('panel-close', 'Close or cancel', groups[4], 'panel-close', 2, -21, 'panel', 'Close / Cancel', 'Dismiss a sheet or cancel editing; also suitable for skipping the streak card.', profile);
cue('link', 'Open a link', groups[4], 'link', 2, -21, 'link', 'Dictionary credit links', 'A subtle outward flick for an external link.', 'src/components/InfoPages.tsx');

cue('edit', 'Ready to edit', groups[5], 'edit', 2, -21, 'name', 'Name pencil', 'The player opens the name field. OS keyboard clicks should remain OS-controlled.', profile);
cue('dice', 'Roll a friendly name', groups[5], 'dice', 3, -17, 'dice', 'Random name dice', 'A little tumble with a definite final settle.', profile);
cue('name-save', 'Name saved', groups[5], 'name-save', 2, -15, 'name', 'Save and greeting badge', 'After a valid changed name is saved.', profile);
cue('name-invalid', 'Name needs a change', groups[5], 'name-invalid', 2, -19, 'warning', 'Name validation', 'Only on a refused Save, not every keystroke or live validation update.', profile);
cue('delete-open', 'A moment to consider', groups[5], 'delete-open', 1, -21, 'delete', 'Delete account sheet', 'An understated opening sound for the confirmation sheet.', profile);
cue('delete-confirm', 'Confirm deletion', groups[5], 'delete-confirm', 1, -21, 'delete', 'Delete everything', 'A restrained acknowledgement when confirmation is accepted.', profile);
cue('delete-complete', 'A fresh page', groups[5], 'delete-complete', 1, -19, 'name', 'Account reset completed', 'A quiet page turn after successful deletion, without a celebration.', 'src/state/GameContext.tsx');
cue('operation-failed', 'Could not finish', groups[5], 'operation-failed', 2, -19, 'warning', 'Offline deletion failure', 'A soft interruption when a user-requested operation fails.', profile);

cue('period', 'Switch ranking period', groups[6], 'period', 3, -19, 'period', 'This week / All time', 'A compact sliding click when the period changes.', 'src/components/Leaderboard.tsx');
cue('refresh', 'Pull and release', groups[6], 'refresh', 2, -19, 'refresh', 'Refresh / Try again', 'At release of a deliberate refresh, or tap on Try again.', board);
cue('board-ready', 'Scores refreshed', groups[6], 'board-ready', 2, -18, 'leaderboard', 'Updated leaderboard', 'One quiet acknowledgement after a user-requested refresh succeeds.', board);
cue('offline', 'Connection unavailable', groups[6], 'offline', 2, -21, 'offline', 'Offline feedback', 'Only after an explicit failed refresh; silent background failures stay silent.', board);

const characters = [
  {id:'mochi',name:'Mochi',identity:'Silky mews with a little purr',f0:370,scale:1.23,air:.035,rough:.03,pulse:27,shape:'cat',pace:.95},
  {id:'bun',name:'Bun',identity:'Soft, airy nose sounds and quick bright answers',f0:305,scale:1.34,air:.10,rough:.01,pulse:0,shape:'bunny',pace:.90},
  {id:'coco',name:'Coco',identity:'Warm chesty hums with a velvety little growl',f0:165,scale:.81,air:.055,rough:.18,pulse:0,shape:'bear',pace:1.06},
  {id:'biscuit',name:'Biscuit',identity:'Breathy puppy yips with a smiling upward finish',f0:335,scale:1.10,air:.12,rough:.11,pulse:0,shape:'puppy',pace:.88},
  {id:'pip',name:'Pip',identity:'Nasal double calls with a crisp penguin chatter',f0:415,scale:1.07,air:.035,rough:.09,pulse:19,shape:'penguin',pace:.83},
  {id:'bao',name:'Bao',identity:'Deep, round, unhurried panda murmurs',f0:145,scale:.88,air:.065,rough:.035,pulse:0,shape:'panda',pace:1.14},
  {id:'koa',name:'Koa',identity:'Sleepy breath, low rounded vowels, a lazy wobble',f0:122,scale:.91,air:.16,rough:.07,pulse:0,shape:'koala',pace:1.23},
  {id:'lolo',name:'Lolo',identity:'Liquid vowel bubbles and buoyant little gurgles',f0:325,scale:1.24,air:.025,rough:.015,pulse:13,shape:'water',pace:.96},
  {id:'rocco',name:'Rocco',identity:'Grainy raccoon chatter with cheeky clipped endings',f0:250,scale:.97,air:.085,rough:.19,pulse:22,shape:'raccoon',pace:.87},
  {id:'ember',name:'Ember',identity:'Bright fox chirrups with quick, curling inflections',f0:290,scale:1.18,air:.05,rough:.065,pulse:0,shape:'fox',pace:.90},
  {id:'sage',name:'Sage',identity:'Rounded two-part hoots with a thoughtful low finish',f0:210,scale:.82,air:.025,rough:.01,pulse:0,shape:'owl',pace:1.14},
  {id:'rexy',name:'Rexy',identity:'A tiny chesty roar with gravel and a proud bounce',f0:108,scale:.74,air:.07,rough:.29,pulse:31,shape:'dino',pace:1.03},
  {id:'vesper',name:'Vesper',identity:'Whispery, narrow little calls with a fluttering tail',f0:445,scale:1.12,air:.11,rough:.025,pulse:34,shape:'bat',pace:.88},
  {id:'button',name:'Button',identity:'Hollow woody syllables with a curious nasal pop',f0:238,scale:1.05,air:.025,rough:.045,pulse:9,shape:'sprite',pace:.96},
  {id:'ribbit',name:'Ribbit',identity:'Round throaty croaks with a fluttering royal flourish',f0:138,scale:.77,air:.025,rough:.15,pulse:24,shape:'frog',pace:1.02},
];
const emotions = [
  {id:'hello',name:'Picked / hello',expression:'happy',use:'Chosen in the shop; a restrained greeting on a new session.'},
  {id:'joy',name:'Win / delight',expression:'joy',use:'A completed word, a new unlock, or a level-up.'},
  {id:'worry',name:'Oops / worried',expression:'worried',use:'Occasional reaction after a balloon pops; not every key.'},
  {id:'fall',name:'Falling',expression:'scared',use:'The short air-drop portion of the final fall.'},
  {id:'land',name:'Landing grunt',expression:'ko',use:'A brief comic exertion sound on impact, not a cry of pain.'},
  {id:'recover',name:'Dazed / recovery',expression:'nervous',use:'A small puzzled vocal after the bounce, then quiet.'},
];
module.exports = {groups, cues, characters, emotions};
