// Times follow the existing visual animations. Voice references use the selected character.
const e=(id,at=0,gain=1)=>({id,at,gain});
module.exports=[
  {id:'correct',name:'A correct letter',description:'A soft key, a warm answer, and the tile opening.',visual:'correct',events:[e('key'),e('correct',.035),e('tile',.08,.65)]},
  {id:'wrong',name:'One balloon pops',description:'The wrong key, rubber tension, a pop, then a little worried reaction.',visual:'wrong',events:[e('key'),e('wrong',.03),e('stretch',.005,.7),e('pop',.144),e('sink',.19,.7),e('@worry',.34,.8)]},
  {id:'fall',name:'The last balloon',description:'Last pop → pause in the air → fall → cushioned landing → dazed recovery.',visual:'fall',events:[e('key'),e('wrong',.03),e('last-stretch'),e('last-pop',.352),e('string',.40),e('fall',.836),e('@fall',.836),e('impact',1.32),e('@land',1.35,.85),e('dust',1.37),e('bounce',1.584),e('stars',1.66,.65),e('@recover',2.04,.75),e('stamp',2.60),e('loss',2.73,.7)]},
  {id:'win',name:'Word complete',description:'The last letter, a delighted character, the result stamp, and earned tokens.',visual:'win',events:[e('key'),e('correct',.035),e('tile',.08,.6),e('win',.16),e('@joy',.25,.9),e('stamp',.70,.75),e('token-gain',.88),e('token-flight',1.42),e('token-land',2.04),e('count',2.10),e('count',2.19,.8),e('count',2.30,.6)]},
  {id:'letters',name:'Buy two letters',description:'Payment leaves the balance and two letters come into view.',visual:'letters',events:[e('token-spend'),e('letters',.08),e('token-flight',.36,.7),e('spend-land',.98)]},
  {id:'streak',name:'Complete a streak',description:'The star fills, settles, and bursts into a token bonus.',visual:'streak',events:[e('streak-open'),e('streak-fill',.66),e('star-land',1.28),e('streak-bonus',1.54),e('confetti',1.54),e('token-gain',1.28,.8),e('token-flight',1.82),e('token-land',2.44),e('count',2.51),e('count',2.62,.7)]},
  {id:'unlock',name:'Unlock a character',description:'A purchase, a tiny lock, a big welcome, and a greeting from your character.',visual:'unlock',events:[e('token-spend'),e('latch',.12),e('unlock',.24),e('confetti',.35),e('@hello',.36),e('token-flight',.36,.6),e('ribbon',.65),e('spend-land',.98,.7)]},
  {id:'choose',name:'Choose a character',description:'Browse, pick, and hear who you are playing with.',visual:'choose',events:[e('browse'),e('choose',.44),e('@hello',.56)]},
  {id:'level-up',name:'Reach a new level',description:'The marker climbs for 950 ms and celebrates on arrival.',visual:'level-up',events:[e('panel-open'),e('level-rise',.73),e('level-up',1.68),e('@joy',1.93,.8)]},
  {id:'level-down',name:'Back one level',description:'A gentle slide and an encouraging landing.',visual:'level-down',events:[e('panel-open'),e('level-slide',.73),e('level-down',1.88),e('@recover',2.09,.7)]},
  {id:'summit',name:'Reach the summit',description:'The final climb, clouds opening, and a crown settling into place.',visual:'summit',events:[e('panel-open'),e('level-rise',.73),e('summit',1.68),e('fog',1.68),e('confetti',1.68),e('@joy',1.98,.85),e('crown',1.86,.75)]},
  {id:'name',name:'A new player name',description:'Open the editor, roll a name, then save it.',visual:'name',events:[e('edit'),e('dice',.60),e('name-save',1.45)]},
  {id:'leaderboard',name:'Check the scores',description:'Change the ranking period, refresh, and receive the updated board.',visual:'leaderboard',events:[e('period'),e('refresh',.35),e('board-ready',1.40)]},
  {id:'next',name:'One more word',description:'Press Next word and hear the new tiles settle.',visual:'next',events:[e('primary'),e('deal',.16)]},
];
