/*
 * The Play screen. It shows one of two layouts for the current round:
 *   - playing: scene, misses, word, letter shop (hardest levels), description, keyboard
 *   - result (won or lost): bigger scene with the stamp, the full word,
 *     the description and "Next word" (mockup: Round lost)
 * When the round ends, the play layout stays a moment so the last
 * animation (the fall, or the last tile popping) can be seen first. A win
 * that makes a streak plays the streak takeover over it, which dissolves
 * onto the result. The round that counts the day says so on its result, the
 * first won round asks once about the daily reminder, and a later win on a
 * roll asks the OS once for a store review (retention.md).
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { characterById } from '../../characters/rig';
import { sound } from '../../audio';
import { useSoundScope } from '../../audio/AudioProvider';
import { GameHeader } from '../../components/GameHeader';
import { Column } from '../../components/Column';
import { GameScene, Stamp, useSceneRange, useStampWidth } from '../../components/GameScene';
import { LetterKeyboard } from '../../components/LetterKeyboard';
import { LevelChange } from '../../components/LevelChange';
import { LevelMap } from '../../components/LevelMap';
import { flameXml, Icon } from '../../components/icons';
import { popFrom } from '../../components/motion';
import { PaperBackground } from '../../components/PaperBackground';
import { ReminderSheet } from '../../components/ReminderSheet';
import { BigButton, DescriptionCard, LetterShopPill, MissesBar, TileLook, WordTiles } from '../../components/RoundParts';
import { STREAK_SHOWN_FROM, StreakTakeover } from '../../components/StreakTakeover';
import { TabBar } from '../../components/TabBar';
import { MEASURABLE, useTokenOrigin } from '../../components/TokenFlight';
import { WelcomeToast } from '../../components/WelcomeToast';
import { LETTER_BUY_COST } from '../../game/config';
import { dailyDays, dailyStatus } from '../../game/daily';
import { balloonsGone, balloonsLeft, sceneStage, keyState, Letter, Round, roundStatus, tileState, usedLetters, wrongCount, guess } from '../../game/engine';
import { guessLetter } from '../../game/languages';
import { canAfford, lettersForSale, reviewWanted } from '../../game/progress';
import { feedback } from '../../feedback';
import { useTranslation } from '../../i18n';
import { remindersSupported } from '../../notify/reminders';
import { askForReview } from '../../review/storeReview';
import { useGame } from '../../state/GameContext';
import { useToday } from '../../state/useDaily';
import { colors, fonts, levelColor } from '../../theme';
import { useLayout } from '../../theme/layout';

// Lost waits for the last balloon to pop and the character to hit the ground (stage 10 is 2200 ms)
const RESULT_DELAY = { lost: 2600, won: 700 };
/** The reminder question waits for the stamp to land and the result to be read. */
const ASK_DELAY = 1400;
/** The store review waits longer: the player has read the result and is choosing to go on. */
const REVIEW_DELAY = 2200;

export default function PlayScreen() {
  const t = useTranslation();
  const audio = useSoundScope();
  const { state, dispatch, startNextRound, setReminders, welcomePending, dismissWelcome } = useGame();
  const today = useToday();
  const round = state.round!;
  const status = roundStatus(round);
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  // The scene grows into the room the rest leaves: the mockup's 230 tall on a phone
  const sceneRange = useSceneRange(130, 230);
  const character = characterById(state.characterId);
  const playerName = state.playerName ?? t('player.defaultName');

  // A round restored already finished goes straight to its result, with no level animation.
  const [restoredId] = useState(status === 'playing' ? null : round.id);
  const [resultFor, setResultFor] = useState<string | null>(restoredId);
  const showResult = resultFor === round.id;
  // A win that makes a streak shows the streak takeover over the round, then dissolves it onto the result.
  // It stays mounted until it has faded out (`streakGone`), so the result is never cut in.
  const [streakFor, setStreakFor] = useState<string | null>(null);
  const [streakGone, setStreakGone] = useState<string | null>(null);
  const streakShown = streakFor === round.id;
  const onStreakGone = useCallback(() => setStreakGone(round.id), [round.id]);
  const revealResult = useCallback(() => {
    setResultFor(round.id);
    feedback.stamp();
    audio.play('stamp');
    if (status === 'lost') audio.sequence([{ cue: 'loss', at: 130, gain: .7 }]);
  }, [round.id, status, audio]);

  // A round that moved the level plays the level path over its result. Until the
  // character lands on the new stop, the header keeps showing the round's level.
  const level = state.levelProgress.level;
  const levelMoved = status !== 'playing' && level !== round.level && round.id !== restoredId;
  const [landedFor, setLandedFor] = useState<string | null>(null);
  const onLevelLanded = useCallback(() => setLandedFor(round.id), [round.id]);
  // The card closes by itself after the landing, leaving the result and its "Next word" button.
  const [levelGone, setLevelGone] = useState<string | null>(null);
  const onLevelGone = useCallback(() => setLevelGone(round.id), [round.id]);
  const levelChanging = levelMoved && levelGone !== round.id;
  // Tapping the header's level opens the level map, except while the level-up card is due
  const [mapOpen, setMapOpen] = useState(false);
  const openMap = useCallback(() => setMapOpen(true), []);
  const closeMap = useCallback(() => setMapOpen(false), []);

  // A just-won result with nothing playing over it: the only moment the game asks the player anything.
  const resultSettled = showResult && status === 'won' && round.id !== restoredId && !levelChanging &&
    (!streakShown || streakGone === round.id) && !mapOpen;
  // The first won round asks about the daily reminder.
  const [askFor, setAskFor] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const askDue = remindersSupported && state.reminders === null && !answered && resultSettled;
  useEffect(() => {
    if (!askDue) return;
    const id = setTimeout(() => setAskFor(round.id), ASK_DELAY);
    return () => clearTimeout(id);
  }, [askDue, round.id]);
  const onReminderAnswer = useCallback((yes: boolean) => {
    // Hidden at once: the OS prompt (yes) comes over the result, not over this sheet.
    setAnswered(true);
    void setReminders(yes);
  }, [setReminders]);

  // A later win on a roll asks the OS once for a review, never on the round that asked about reminders.
  // "Next word" before the delay skips it: a later win tries again.
  const reviewDue = resultSettled && !askDue && askFor !== round.id && reviewWanted(state);
  useEffect(() => {
    if (!reviewDue) return;
    const id = setTimeout(() => void askForReview(() => dispatch({ type: 'reviewAsked', at: Date.now() })), REVIEW_DELAY);
    return () => clearTimeout(id);
  }, [reviewDue, round.id, dispatch]);

  const streak = state.streak;
  useEffect(() => {
    if (status === 'playing' || resultFor === round.id || streakFor === round.id) return;
    if (status === 'won') {
      feedback.won();
      audio.sequence([{ cue: 'win', at: 100 }, { voice: 'joy', character: character.id, at: 220, gain: .9 }]);
    }
    else feedback.lost();
    const celebrate = status === 'won' && streak >= STREAK_SHOWN_FROM;
    const id = setTimeout(() => (celebrate ? setStreakFor(round.id) : revealResult()), RESULT_DELAY[status]);
    return () => clearTimeout(id);
  }, [status, round.id, resultFor, streakFor, streak, revealResult, audio, character.id]);

  const onKey = useCallback(
    (c: Letter) => {
      if (roundStatus(round) !== 'playing' || usedLetters(round).has(c)) return;
      const next = guess(round, c);
      if (next === round) return;
      sound.unlock();
      audio.play('key');
      audio.sequence(wrongCount(next) > wrongCount(round)
        ? [{ cue: 'wrong', at: 30 }]
        : [{ cue: 'correct', at: 35 }, { cue: 'tile', at: 80, gain: .65 }]);
      dispatch({ type: 'guess', letter: c, at: Date.now() });
    },
    [round, dispatch, audio],
  );

  const onBuyLetters = useCallback(() => {
    feedback.unlock();
    audio.play('letters');
    dispatch({ type: 'buyLetters' });
  }, [dispatch, audio]);

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <Column>
        <View style={{ height: insets.top }} />
        <GameHeader
          name={playerName}
          character={character}
          wordsGuessed={state.wordsGuessed}
          level={levelMoved && landedFor !== round.id ? round.level : level}
          tokens={state.tokens}
          dailyDays={dailyDays(state.daily, today)}
          dailyDone={dailyStatus(state.daily, today) === 'done'}
          onLevelPress={levelChanging ? undefined : openMap}
        />
        <View style={[styles.body, { paddingHorizontal: layout.gutter }]}>
          {showResult ? (
            <ResultView
              round={round}
              status={status === 'won' ? 'won' : 'lost'}
              characterName={character.name}
              character={character}
              tokensEarned={state.lastTokensEarned}
              rewardFlown={streakShown}
              streak={streak}
              dailyDays={state.dailyCountedBy === round.id ? state.daily.days : 0}
              level={level}
              onNext={() => { audio.cancel(); startNextRound(); audio.sequence([{ cue: 'deal', at: 100 }]); }}
            />
          ) : (
            <>
              <GameScene
                key={round.id}
                character={character}
                stage={sceneStage(round)}
                gone={balloonsGone(round)}
                mode="play"
                entering={welcomePending}
                style={[styles.playScene, sceneRange]}
                accessibilityLabel={t('play.a11y.scene', { name: character.name, left: balloonsLeft(round) })}
              />
              <MissesBar wrong={wrongCount(round)} max={round.maxWrong} />
              <WordTiles letters={round.word.split('').map((c) => ({ letter: c, look: tileState(round, c) as TileLook }))} />
              {lettersForSale(state) && (
                <LetterShopPill
                  canAfford={canAfford(state, LETTER_BUY_COST)}
                  onBuy={onBuyLetters}
                />
              )}
              <DescriptionCard text={round.description} subject={round.subject} />
              <LetterKeyboard language={round.language}
                keyState={(c) => keyState(round, c)}
                locked={status !== 'playing'}
                onPress={onKey}
              />
            </>
          )}
          {welcomePending && <WelcomeToast name={playerName} character={character} onDone={dismissWelcome} />}
          {streakShown && streakGone !== round.id && (
            <StreakTakeover
              key={round.id}
              streak={streak}
              tokens={state.lastTokensEarned}
              character={character}
              onReveal={revealResult}
              onDone={onStreakGone}
            />
          )}
        </View>
        <TabBar active="play" />
      </Column>
      {showResult && levelChanging && (
        <LevelChange
          key={round.id}
          from={round.level}
          to={level}
          best={state.bestLevel}
          character={character}
          onLanded={onLevelLanded}
          onClose={onLevelGone}
        />
      )}
      {askDue && askFor === round.id && <ReminderSheet character={character} onAnswer={onReminderAnswer} />}
      {mapOpen && <LevelMap progress={state.levelProgress} best={state.bestLevel} character={character} onClose={closeMap} />}
    </View>
  );
}

function ResultView({ round, status, character, characterName, tokensEarned, rewardFlown, streak, dailyDays, level, onNext }: {
  round: Round;
  status: 'won' | 'lost';
  character: ReturnType<typeof characterById>;
  characterName: string;
  tokensEarned: number;
  /** The streak takeover already flew the reward into the counter. */
  rewardFlown: boolean;
  streak: number;
  /** The daily streak this round brought (0: today had already counted). */
  dailyDays: number;
  /** The player's level now: not the round's level when this round moved it. */
  level: number;
  onNext: () => void;
}) {
  const t = useTranslation();
  const layout = useLayout();
  const [onSceneLayout, stampWidth] = useStampWidth();
  // Taller than the mockup's 282: the result has less below it
  const sceneRange = useSceneRange(180, 340);
  const lineSize = { fontSize: Math.round(15 * layout.type) };
  const used = usedLetters(round);
  const wrong = wrongCount(round);
  const won = status === 'won';
  const paid = won && tokensEarned > 0;
  // The reward flies from its badge into the token counter (TokenFlight)
  const [badgeRef, sendToken] = useTokenOrigin();
  useEffect(() => {
    if (paid && !rewardFlown) sendToken(1);
  }, [paid, rewardFlown, sendToken]);
  const letters = round.word.split('').map((c) => ({
    letter: c,
    // Lost: what was found turns mint, what was missed turns coral (mockup)
    look: (won ? tileState(round, c) : used.has(guessLetter(c, round.language)) ? 'ok' : 'miss') as TileLook,
  }));

  return (
    <>
      <View style={[styles.resultScene, sceneRange]} onLayout={onSceneLayout}>
        <GameScene
          character={character}
          stage={sceneStage(round)}
          gone={balloonsGone(round)}
          mode={status}
          style={{ flex: 1 }}
          accessibilityLabel={won ? t('result.won.stamp') : t('result.lost.stamp')}
        />
        <Stamp
          visible={stampWidth > 0}
          text={won ? t('result.won.stamp') : t('result.lost.stamp')}
          color={won ? colors.stampGreen : colors.stampRed}
          width={stampWidth}
        />
      </View>
      <View style={[styles.over, layout.tight && styles.overTight]}>
        <Text style={[styles.overText, lineSize]}>
          {won
            ? t('result.won.line', { name: characterName, wrong, max: round.maxWrong })
            : t('result.lost.line', { wrong, max: round.maxWrong })}
        </Text>
        {paid && (
          <View ref={badgeRef} {...MEASURABLE} style={styles.earned}>
            <Text style={styles.earnedText}>
              {tokensEarned === 1 ? t('result.tokenEarned') : t('result.tokensEarned', { count: tokensEarned })}
              {streak > 1 && ` · ${t('result.streak', { count: streak })}`}
            </Text>
          </View>
        )}
      </View>
      {level !== round.level && (
        <Text style={[styles.levelLine, { color: levelColor(level).dark, fontSize: Math.round(14 * layout.type) }]}>
          {t(level > round.level ? 'result.levelUp' : 'result.levelDown', { level })}
        </Text>
      )}
      {dailyDays > 0 && <DailyLine days={dailyDays} />}
      <WordTiles letters={letters} />
      <DescriptionCard text={round.description} subject={round.subject} />
      <View style={styles.actions}>
        <BigButton label={t('result.nextWord')} onPress={onNext} />
        <BigButton ghost label={t('result.changeCharacter')} onPress={() => router.navigate('/characters')} />
      </View>
    </>
  );
}

/** "N days in a row!" under the result's lines, on the round that counted the day. It pops in, as the header's flame lights. */
function DailyLine({ days }: { days: number }) {
  const t = useTranslation();
  const [pop] = useState(() => new Animated.Value(1));
  useEffect(() => popFrom(pop, 1.3), [pop]);
  return (
    <Animated.View style={[styles.dailyLine, { transform: [{ scale: pop }] }]}>
      <Icon xml={flameXml(true)} size={17} />
      <Text style={styles.dailyText}>{days === 1 ? t('result.daily.first') : t('result.daily.more', { count: days })}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, minHeight: 0 },
  playScene: { flexGrow: 1, flexShrink: 1 },
  resultScene: { flexGrow: 1, flexShrink: 1 },
  // The badge goes under the line when they don't fit side by side
  over: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 8, rowGap: 4 },
  overTight: { marginTop: 9 },
  overText: { fontFamily: fonts.display500, fontSize: 15, color: colors.muted, textAlign: 'center' },
  earned: { backgroundColor: colors.butterL, borderColor: '#ffe39a', borderWidth: 2, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 1 },
  earnedText: { fontFamily: fonts.display600, fontSize: 13, color: colors.butterT },
  levelLine: { marginTop: 6, fontFamily: fonts.display600, fontSize: 14, textAlign: 'center' },
  dailyLine: { marginTop: 6, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  dailyText: { fontFamily: fonts.display600, fontSize: 14, color: colors.flameT, flexShrink: 1, textAlign: 'center' },
  actions: { marginTop: 'auto', paddingTop: 8 },
});
