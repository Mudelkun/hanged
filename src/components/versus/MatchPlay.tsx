/*
 * A Versus match being played. It reuses the solo round's pieces (scene,
 * tiles, description, keyboard) and draws them from what the server sends:
 * the device never has the word, only the letters it found, so a key just
 * pressed waits (faded) for the server's answer, usually a few tens of ms.
 *   - countdown: 3, 2, 1
 *   - play: your word; everyone's score in the row on top
 *   - Word Duel also has pick (choose a word for the other) and reveal (the round's result)
 * Every deadline is the server's; the timer only shows it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchPlayer, MatchView, PuzzleView, WordCard } from '../../../server/src/versus-contract';
import { MODES } from '../../../server/src/versus-contract';
import { useSoundScope } from '../../audio/AudioProvider';
import { Character } from '../../characters/rig';
import { feedback } from '../../feedback';
import { SCENE_STAGES } from '../../game/config';
import { goneFor, KeyState, Letter, stageFor } from '../../game/engine';
import { displayLetter, guessLetter } from '../../game/languages';
import { useTranslation } from '../../i18n';
import { useVersus } from '../../state/VersusContext';
import { colors, fonts } from '../../theme';
import { GameScene, SceneMode } from '../GameScene';
import { balloonXml, closeXml, Icon } from '../icons';
import { LetterKeyboard } from '../LetterKeyboard';
import { Raised } from '../Raised';
import { DescriptionCard, MissesBar, TileLook, WordTiles } from '../RoundParts';
import { display, displayName, Face, formatClock, MODE_LOOK, ModeChip, modeTagline, PillButton, ScoreChip, Sheet, useSecondsLeft, versusStyles } from './parts';

const FLASH_MS = 1_100;
const HIT_MS = 1_600;

interface Props {
  match: MatchView;
  character: Character;
  available: number;
  compact: boolean;
}

export function MatchPlay({ match, character, available, compact }: Props) {
  const t = useTranslation();
  const { state, actions } = useVersus();
  const [leaving, setLeaving] = useState(false);
  const me = state.me;
  const mine = match.players.find((p) => p.id === me);
  const rival = match.players.find((p) => p.id !== me);
  const hitShown = useRecent(state.hit?.at, HIT_MS);

  return (
    <View style={styles.fill}>
      <MatchHeader match={match} onLeave={() => setLeaving(true)} />
      <View style={styles.scores}>
        {match.players.map((p) => (
          <ScoreChip key={p.id} player={p} mode={match.mode} me={p.id === me} flash={hitShown && state.hit?.to === p.id} />
        ))}
      </View>
      {state.conn !== 'online' && <Text style={styles.reconnecting}>{t('versus.reconnecting')}</Text>}
      {match.phase === 'countdown' ? (
        <Countdown match={match} character={character} compact={compact} />
      ) : match.phase === 'pick' ? (
        <PickView match={match} rival={rival} />
      ) : match.phase === 'reveal' && match.last ? (
        <RevealView match={match} />
      ) : match.you && mine ? (
        <WordPlay match={match} you={match.you} mine={mine} rival={rival} character={character} available={available} compact={compact} />
      ) : (
        <Landed character={character} compact={compact} />
      )}
      <Sheet visible={leaving} onClose={() => setLeaving(false)} title={t('versus.match.leaveTitle')}>
        <Text style={[versusStyles.body, versusStyles.center]}>{t(match.ranked ? 'versus.match.leaveRanked' : 'versus.match.leaveBody')}</Text>
        <PillButton
          label={t('versus.match.leaveConfirm')}
          cue="back"
          onPress={() => {
            setLeaving(false);
            actions.forfeit();
          }}
        />
        <PillButton label={t('versus.match.stay')} ghost cue="panel-close" onPress={() => setLeaving(false)} />
      </Sheet>
    </View>
  );
}

/** true for `ms` after `at` (a device time), then false: for flashes. */
function useRecent(at: number | undefined, ms: number) {
  const [over, setOver] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (at === undefined) return;
    const id = setTimeout(() => setOver(at), ms);
    return () => clearTimeout(id);
  }, [at, ms]);
  return at !== undefined && over !== at;
}

function MatchHeader({ match, onLeave }: { match: MatchView; onLeave: () => void }) {
  const t = useTranslation();
  const left = useSecondsLeft(match.phase === 'countdown' ? null : match.endsAt);
  const hurry = left !== null && left <= 10 && match.phase === 'play';
  return (
    <View style={styles.header}>
      <Pressable onPress={onLeave} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('versus.match.leave')}>
        {({ pressed }) => (
          <Raised depth={3} shadowColor={colors.shadow} radius={15} pressed={pressed} style={styles.leave}>
            <Icon xml={closeXml()} size={18} />
          </Raised>
        )}
      </Pressable>
      <View style={styles.headerMiddle}>
        <ModeChip mode={match.mode} />
        {match.mode === 'duel' && match.round > 0 && <Text style={styles.round}>{t('versus.match.round', { round: match.round, rounds: MODES.duel.rounds })}</Text>}
      </View>
      {/* No clock during the 3-2-1: the big number is the clock */}
      <View style={[styles.timer, hurry && styles.timerHurry, left === null && styles.timerHidden]} accessible={left !== null} accessibilityLabel={left === null ? undefined : t('versus.a11y.timer', { seconds: left })}>
        <Text style={[styles.timerText, hurry && styles.timerTextHurry]}>{left === null ? '0:00' : formatClock(left)}</Text>
      </View>
    </View>
  );
}

function Countdown({ match, character, compact }: { match: MatchView; character: Character; compact: boolean }) {
  const t = useTranslation();
  const audio = useSoundScope();
  const left = useSecondsLeft(match.endsAt);
  useEffect(() => {
    if (left) audio.play('count');
  }, [left, audio]);
  return (
    <View style={styles.fill}>
      <GameScene character={character} stage={0} gone={match.mode === 'battle' ? 0 : SCENE_STAGES - (match.mode === 'rush' ? MODES.rush.maxWrong : MODES.duel.maxWrong)} mode="play" style={[styles.scene, { minHeight: compact ? 140 : 200 }]} />
      <View style={styles.countdown}>
        <Text style={styles.countNumber} accessibilityLiveRegion="assertive">{left ? left : t('versus.match.go')}</Text>
        <Text style={[versusStyles.body, versusStyles.center]}>{modeTagline(t, match.mode)}</Text>
      </View>
    </View>
  );
}

function tileLooks(you: PuzzleView): { letter: string; look: TileLook }[] {
  return you.tiles.map((letter) => ({
    letter,
    look: !letter ? 'hidden' : you.clues.includes(guessLetter(letter, you.language)) ? 'clue' : 'ok',
  }));
}

function WordPlay({ match, you, mine, rival, character, available, compact }: {
  match: MatchView;
  you: PuzzleView;
  mine: MatchPlayer;
  rival?: MatchPlayer;
  character: Character;
  available: number;
  compact: boolean;
}) {
  const t = useTranslation();
  const audio = useSoundScope();
  const { state, actions } = useVersus();
  const battle = match.mode === 'battle';
  const duel = match.mode === 'duel';
  const flash = state.flash;
  const flashing = useRecent(flash?.at, FLASH_MS);
  const hit = state.hit;
  const hitShown = useRecent(hit?.at, HIT_MS);

  // The scene: per word in Rush and Duel (one balloon per allowed miss), the whole match in Battle
  const missesGone = battle ? SCENE_STAGES - mine.balloons : you.wrong;
  const maxGone = battle ? SCENE_STAGES : you.maxWrong;
  const done = duel && you.status !== 'playing';
  const sceneMode: SceneMode = done ? (you.status === 'won' ? 'won' : 'lost') : 'play';

  // The server's answer to a key: a sound for a hit or a miss (the scene pops its own balloons)
  const last = useRef({ index: you.index, hits: you.hits.length, misses: you.misses.length });
  useEffect(() => {
    const before = last.current;
    last.current = { index: you.index, hits: you.hits.length, misses: you.misses.length };
    if (before.index !== you.index) return;
    if (you.misses.length > before.misses) audio.play('wrong');
    else if (you.hits.length > before.hits) audio.sequence([{ cue: 'correct', at: 0 }, { cue: 'tile', at: 45, gain: 0.65 }]);
  }, [you, audio]);

  useEffect(() => {
    if (!flash) return;
    if (flash.won) {
      feedback.won();
      audio.sequence([{ cue: 'win', at: 60, gain: 0.8 }]);
    } else audio.play('refused');
    if (!duel) audio.sequence([{ cue: 'deal', at: 450 }]);
  }, [flash, duel, audio]);

  useEffect(() => {
    if (!hit || !state.me) return;
    if (hit.to === state.me) feedback.lost();
    else if (hit.from === state.me) audio.play('confetti');
  }, [hit, state.me, audio]);

  const keyState = useCallback(
    (c: Letter): KeyState => (you.clues.includes(c) ? 'clue' : you.hits.includes(c) ? 'ok' : you.misses.includes(c) ? 'no' : 'idle'),
    [you],
  );
  const pending = useCallback((c: Letter) => state.pending.some((p) => p.letter === c), [state.pending]);
  const locked = match.phase !== 'play' || you.status !== 'playing' || state.conn !== 'online';
  const onKey = useCallback(
    (c: Letter) => {
      if (locked || keyState(c) !== 'idle' || pending(c)) return;
      audio.play('key');
      actions.guess(c);
    },
    [locked, keyState, pending, audio, actions],
  );

  const nameOf = (id: string) => displayName(t, match.players.find((p) => p.id === id)?.name ?? null);
  const hitText = hit && state.me && (hit.to === state.me
    ? t('versus.match.popped', { name: nameOf(hit.from), count: hit.count })
    : hit.from === state.me
      ? t('versus.match.youPopped', { name: nameOf(hit.to), count: hit.count })
      : null);

  return (
    <>
      <View style={[styles.sceneWrap, { minHeight: compact ? 96 : 130 }]}>
        <GameScene
          key={battle ? 'battle' : you.index}
          character={character}
          stage={stageFor(missesGone, maxGone)}
          gone={battle ? missesGone : goneFor(you.wrong, you.maxWrong)}
          mode={sceneMode}
          style={styles.fill}
          accessibilityLabel={t('play.a11y.scene', { name: character.name, left: battle ? mine.balloons : you.maxWrong - you.wrong })}
        />
        {hitShown && hitText && (
          <View style={[styles.banner, hit!.to === state.me ? styles.bannerBad : styles.bannerGood]} pointerEvents="none">
            <Text style={styles.bannerText}>{hitText}</Text>
          </View>
        )}
      </View>
      <View style={styles.underScene}>
        <View style={styles.fill}>
          {battle ? (
            <View style={styles.balloonsLeft}>
              <Icon xml={balloonXml(colors.coral)} size={18} />
              <Text style={styles.balloonsText}>{t('versus.match.balloonsLeft', { count: mine.balloons })}</Text>
            </View>
          ) : (
            <MissesBar wrong={you.wrong} max={you.maxWrong} />
          )}
        </View>
        {!duel && (
          <PillButton
            small
            ghost
            label={battle ? t('versus.match.skipBattle', { count: MODES.battle.skipCost }) : t('versus.match.skip')}
            onPress={actions.skip}
            disabled={locked}
            cue="tap"
            style={styles.skip}
          />
        )}
      </View>
      <View>
        <WordTiles letters={tileLooks(you)} available={available} compact={compact} />
        {flashing && flash && !duel && (
          <View style={[styles.flash, flash.won ? styles.flashWon : styles.flashLost]} pointerEvents="none" accessibilityLiveRegion="polite">
            <Text style={styles.flashText}>{flash.won ? t('versus.match.solved') : t('versus.match.wasWord', { word: flash.word.toUpperCase() })}</Text>
          </View>
        )}
      </View>
      <DescriptionCard text={you.description} subject={you.subject} compact={compact} />
      {done ? (
        <DoneCard won={you.status === 'won'} word={flash?.index === you.index ? flash.word : null} misses={you.wrong} rival={rival} />
      ) : (
        <LetterKeyboard language={you.language} keyState={keyState} pending={pending} locked={locked} onPress={onKey} available={available} compact={compact} />
      )}
    </>
  );
}

/** Word Duel: this player's word is done; the other is still guessing. */
function DoneCard({ won, word, misses, rival }: { won: boolean; word: string | null; misses: number; rival?: MatchPlayer }) {
  const t = useTranslation();
  return (
    <View style={styles.done}>
      <Text style={[styles.doneTitle, { color: won ? colors.mintT : colors.coralD }]}>
        {won ? t('versus.match.solvedIn', { misses }) : word ? t('versus.match.wasWord', { word: word.toUpperCase() }) : t('versus.match.missed')}
      </Text>
      {rival && !rival.out && <Text style={[versusStyles.body, versusStyles.center]}>{t('versus.match.waitingFor', { name: displayName(t, rival.name) })}</Text>}
    </View>
  );
}

/** Balloon Battle: no balloons left. The others play on. */
function Landed({ character, compact }: { character: Character; compact: boolean }) {
  const t = useTranslation();
  return (
    <View style={styles.fill}>
      <GameScene character={character} stage={SCENE_STAGES} gone={SCENE_STAGES} mode="lost" style={[styles.scene, { minHeight: compact ? 160 : 230 }]} />
      <Text style={[versusStyles.title, versusStyles.center, styles.landedTitle]}>{t('versus.match.landed')}</Text>
      <Text style={[versusStyles.body, versusStyles.center]}>{t('versus.match.landedBody')}</Text>
    </View>
  );
}

/** Word Duel's pick: one of your cards, or a word typed from the dictionary, for the other player. */
function PickView({ match, rival }: { match: MatchView; rival?: MatchPlayer }) {
  const t = useTranslation();
  const { state, actions } = useVersus();
  const [typed, setTyped] = useState('');
  const name = displayName(t, rival?.name ?? null);
  const look = MODE_LOOK.duel;
  if (match.picked) {
    return (
      <View style={[styles.fill, styles.waiting]}>
        {rival && <Face characterId={rival.characterId} size={72} />}
        <Text style={[versusStyles.title, versusStyles.center]}>{t('versus.match.picked', { name })}</Text>
      </View>
    );
  }
  const sending = state.pick.sending;
  const send = () => {
    const word = typed.trim();
    if (!word || sending) return;
    actions.pick({ word });
  };
  return (
    <View style={styles.fill}>
      <Text style={[versusStyles.title, versusStyles.center, styles.pickTitle]}>{t('versus.match.pickTitle', { name })}</Text>
      <Text style={[versusStyles.body, versusStyles.center]}>{t('versus.match.pickBody')}</Text>
      <View style={styles.cards}>
        {(match.cards ?? []).map((card: WordCard, i) => (
          <Pressable key={card.word} disabled={sending} onPress={() => actions.pick({ card: i })} accessibilityRole="button" accessibilityLabel={`${card.word}. ${card.description}`}>
            {({ pressed }) => (
              <Raised depth={4} pressed={pressed} shadowColor={look.main} radius={18} style={[versusStyles.card, styles.card, { borderColor: look.light }]}>
                <Text style={[styles.cardWord, { color: look.dark }]}>{[...card.word].map(displayLetter).join(' ')}</Text>
                <Text style={styles.cardDesc} numberOfLines={2}>{card.description}</Text>
              </Raised>
            )}
          </Pressable>
        ))}
      </View>
      <Text style={styles.typeLabel}>{t('versus.match.typeWord')}</Text>
      <View style={styles.typeRow}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={15}
          placeholder={t('versus.match.typePlaceholder')}
          placeholderTextColor="#c9b5a4"
          onSubmitEditing={send}
          returnKeyType="send"
          style={styles.typeInput}
          accessibilityLabel={t('versus.match.typeWord')}
        />
        <PillButton label={t('versus.match.send')} onPress={send} disabled={!typed.trim() || sending} color={look.main} shadow={look.dark} />
      </View>
      {state.pick.error && <Text style={styles.pickError}>{t(`versus.error.${state.pick.error}`)}</Text>}
    </View>
  );
}

/** Word Duel: who won the round just played, and the two words. */
function RevealView({ match }: { match: MatchView }) {
  const t = useTranslation();
  const audio = useSoundScope();
  const { state } = useVersus();
  const last = match.last!;
  const left = useSecondsLeft(match.endsAt);
  const me = state.me;
  const won = last.winnerId === me;
  const rival = match.players.find((p) => p.id !== me);
  useEffect(() => {
    audio.play(last.winnerId === null ? 'stamp' : last.winnerId === me ? 'level-up' : 'level-down');
  }, [last.round, last.winnerId, me, audio]);
  const decided = match.players.some((p) => p.score >= MODES.duel.winsNeeded) || match.round >= MODES.duel.rounds;
  const headline = last.winnerId === null
    ? t('versus.match.roundDraw', { round: last.round })
    : won
      ? t('versus.match.roundWon', { round: last.round })
      : t('versus.match.roundLost', { round: last.round, name: displayName(t, rival?.name ?? null) });
  return (
    <View style={[styles.fill, styles.reveal]}>
      <Text style={[styles.revealTitle, { color: last.winnerId === null ? colors.butterT : won ? colors.mintT : colors.coralD }]} accessibilityLiveRegion="polite">
        {headline}
      </Text>
      {last.results.map((r) => {
        const p = match.players.find((x) => x.id === r.id);
        return (
          <View key={r.id} style={[styles.revealRow, r.id === me && styles.revealMe]}>
            <Face characterId={p?.characterId ?? 'mochi'} size={36} />
            <View style={styles.fill}>
              <Text style={styles.revealWord}>{r.word.toUpperCase()}</Text>
              <Text style={styles.revealSub}>
                {r.solved ? t('versus.match.solvedStats', { misses: r.misses, seconds: Math.round(r.ms / 1000) }) : t('versus.match.missed')}
              </Text>
            </View>
            <Text style={[styles.revealMark, { color: r.solved ? colors.mintT : colors.coralD }]}>{r.solved ? '✓' : '✗'}</Text>
          </View>
        );
      })}
      <Text style={styles.revealScore}>{match.players.map((p) => p.score).join('  –  ')}</Text>
      {left !== null && <Text style={[versusStyles.body, versusStyles.center]}>{t(decided ? 'versus.match.resultsIn' : 'versus.match.nextIn', { seconds: left })}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2, paddingBottom: 8 },
  leave: { width: 40, height: 38, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  headerMiddle: { alignItems: 'center', gap: 2 },
  round: { fontFamily: fonts.body800, fontSize: 12, color: colors.muted },
  timer: { minWidth: 72, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 2, borderColor: colors.line, paddingVertical: 5, paddingHorizontal: 10 },
  timerHurry: { backgroundColor: colors.coral, borderColor: colors.coralD },
  timerHidden: { opacity: 0 },
  timerText: { ...display('700', 19), fontVariant: ['tabular-nums'] },
  timerTextHurry: { color: '#fff' },
  scores: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  reconnecting: { ...display('600', 13, colors.coralD), textAlign: 'center', marginBottom: 6 },

  scene: { flexGrow: 1, flexShrink: 1, maxHeight: 300 },
  sceneWrap: { flexGrow: 1, flexShrink: 1, maxHeight: 220 },
  countdown: { alignItems: 'center', marginTop: 14, gap: 4 },
  countNumber: display('700', 72, colors.coral),
  underScene: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skip: { marginTop: 10 },
  balloonsLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 11, marginLeft: 4 },
  balloonsText: display('600', 14.5, colors.coralD),

  banner: { position: 'absolute', top: 10, alignSelf: 'center', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  bannerBad: { backgroundColor: colors.coral },
  bannerGood: { backgroundColor: colors.mint },
  bannerText: display('700', 15, '#fff'),
  flash: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -18, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  flashWon: { backgroundColor: colors.mint },
  flashLost: { backgroundColor: colors.coral },
  flashText: display('700', 17, '#fff'),

  done: { marginTop: 'auto', marginBottom: 'auto', alignItems: 'center', gap: 6, paddingVertical: 16 },
  doneTitle: { ...display('700', 22), textAlign: 'center' },
  landedTitle: { marginTop: 14 },

  waiting: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  pickTitle: { marginTop: 6 },
  cards: { gap: 10, marginTop: 12 },
  card: { paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  cardWord: { ...display('700', 21), letterSpacing: 1 },
  cardDesc: { fontFamily: fonts.body700, fontSize: 13.5, lineHeight: 18, color: colors.muted },
  typeLabel: { fontFamily: fonts.display600, fontSize: 13, letterSpacing: 0.5, color: colors.muted, marginTop: 16, marginBottom: 6, marginLeft: 4 },
  typeRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  typeInput: { flex: 1, ...display('600', 18), backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  pickError: { ...display('600', 14, colors.coralD), textAlign: 'center', marginTop: 8 },

  reveal: { gap: 10, paddingTop: 10 },
  revealTitle: { ...display('700', 26), textAlign: 'center', marginBottom: 6 },
  revealRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 18, borderWidth: 2, borderColor: colors.line, padding: 10 },
  revealMe: { borderColor: colors.coral },
  revealWord: { ...display('700', 19), letterSpacing: 1 },
  revealSub: { fontFamily: fonts.body700, fontSize: 13, color: colors.muted },
  revealMark: display('700', 26),
  revealScore: { ...display('700', 40, colors.ink), textAlign: 'center', marginTop: 8 },
});
