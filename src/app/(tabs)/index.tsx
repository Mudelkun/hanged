/*
 * The Play screen. It shows one of two layouts for the current round:
 *   - playing: scene, misses, word, letter shop (hardest levels), description, keyboard
 *   - result (won or lost): bigger scene with the stamp, the full word,
 *     the description and "Next word" (mockup: Round lost)
 * When the round ends, the play layout stays a moment so the last
 * animation (the fall, or the last tile popping) can be seen first. A win
 * that makes a streak plays the streak takeover over it, which dissolves
 * onto the result.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { characterById } from '../../characters/rig';
import { sound } from '../../audio';
import { useSoundScope } from '../../audio/AudioProvider';
import { GameHeader } from '../../components/GameHeader';
import { GameScene, Stamp } from '../../components/GameScene';
import { LetterKeyboard } from '../../components/LetterKeyboard';
import { LevelChange } from '../../components/LevelChange';
import { LevelMap } from '../../components/LevelMap';
import { PaperBackground } from '../../components/PaperBackground';
import { BigButton, DescriptionCard, LetterShopPill, MissesBar, TileLook, WordTiles } from '../../components/RoundParts';
import { STREAK_SHOWN_FROM, StreakTakeover } from '../../components/StreakTakeover';
import { TabBar } from '../../components/TabBar';
import { useTokenOrigin } from '../../components/TokenFlight';
import { WelcomeToast } from '../../components/WelcomeToast';
import { LETTER_BUY_COST } from '../../game/config';
import { balloonsGone, balloonsLeft, sceneStage, keyState, Letter, Round, roundStatus, tileState, usedLetters, wrongCount, guess } from '../../game/engine';
import { guessLetter } from '../../game/languages';
import { lettersForSale } from '../../game/progress';
import { feedback } from '../../feedback';
import { useTranslation } from '../../i18n';
import { useGame } from '../../state/GameContext';
import { colors, fonts, levelColor } from '../../theme';

// Lost waits for the last balloon to pop and the character to hit the ground (stage 10 is 2200 ms)
const RESULT_DELAY = { lost: 2600, won: 700 };

export default function PlayScreen() {
  const t = useTranslation();
  const audio = useSoundScope();
  const { state, dispatch, startNextRound, welcomePending, dismissWelcome } = useGame();
  const round = state.round!;
  const status = roundStatus(round);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const available = width - 32;
  const compact = height < 760;
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
      <View style={{ height: insets.top }} />
      <GameHeader
        name={playerName}
        character={character}
        wordsGuessed={state.wordsGuessed}
        level={levelMoved && landedFor !== round.id ? round.level : level}
        tokens={state.tokens}
        onLevelPress={levelChanging ? undefined : openMap}
      />
      <View style={styles.body}>
        {showResult ? (
          <ResultView
            round={round}
            status={status === 'won' ? 'won' : 'lost'}
            characterName={character.name}
            character={character}
            tokensEarned={state.lastTokensEarned}
            rewardFlown={streakShown}
            streak={streak}
            level={level}
            available={available}
            compact={compact}
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
              style={[styles.playScene, { minHeight: compact ? 96 : 130 }]}
              accessibilityLabel={t('play.a11y.scene', { name: character.name, left: balloonsLeft(round) })}
            />
            <MissesBar wrong={wrongCount(round)} max={round.maxWrong} />
            <WordTiles
              letters={round.word.split('').map((c) => ({ letter: c, look: tileState(round, c) as TileLook }))}
              available={available}
              compact={compact}
            />
            {lettersForSale(state) && (
              <LetterShopPill
                canAfford={state.tokens >= LETTER_BUY_COST}
                onBuy={onBuyLetters}
                compact={compact}
              />
            )}
            <DescriptionCard text={round.description} subject={round.subject} compact={compact} />
            <LetterKeyboard language={round.language}
              keyState={(c) => keyState(round, c)}
              locked={status !== 'playing'}
              onPress={onKey}
              available={available}
              compact={compact}
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
            compact={compact}
            onReveal={revealResult}
            onDone={onStreakGone}
          />
        )}
      </View>
      <TabBar active="play" compact={compact} />
      {showResult && levelChanging && (
        <LevelChange
          key={round.id}
          from={round.level}
          to={level}
          best={state.bestLevel}
          character={character}
          width={available}
          compact={compact}
          onLanded={onLevelLanded}
          onClose={onLevelGone}
        />
      )}
      {mapOpen && <LevelMap progress={state.levelProgress} best={state.bestLevel} character={character} onClose={closeMap} />}
    </View>
  );
}

function ResultView({ round, status, character, characterName, tokensEarned, rewardFlown, streak, level, available, compact, onNext }: {
  round: Round;
  status: 'won' | 'lost';
  character: ReturnType<typeof characterById>;
  characterName: string;
  tokensEarned: number;
  /** The streak takeover already flew the reward into the counter. */
  rewardFlown: boolean;
  streak: number;
  /** The player's level now: not the round's level when this round moved it. */
  level: number;
  available: number;
  compact: boolean;
  onNext: () => void;
}) {
  const t = useTranslation();
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
      <View style={[styles.resultScene, { minHeight: compact ? 140 : 180 }]}>
        <GameScene
          character={character}
          stage={sceneStage(round)}
          gone={balloonsGone(round)}
          mode={status}
          style={{ flex: 1 }}
          accessibilityLabel={won ? t('result.won.stamp') : t('result.lost.stamp')}
        />
        <Stamp
          visible
          text={won ? t('result.won.stamp') : t('result.lost.stamp')}
          color={won ? colors.stampGreen : colors.stampRed}
          width={Math.min(372, available + 26)}
        />
      </View>
      <View style={styles.over}>
        <Text style={styles.overText}>
          {won
            ? t('result.won.line', { name: characterName, wrong, max: round.maxWrong })
            : t('result.lost.line', { wrong, max: round.maxWrong })}
        </Text>
        {paid && (
          <View ref={badgeRef} collapsable={false} style={styles.earned}>
            <Text style={styles.earnedText}>
              {tokensEarned === 1 ? t('result.tokenEarned') : t('result.tokensEarned', { count: tokensEarned })}
              {streak > 1 && ` · ${t('result.streak', { count: streak })}`}
            </Text>
          </View>
        )}
      </View>
      {level !== round.level && (
        <Text style={[styles.levelLine, { color: levelColor(level).dark }]}>
          {t(level > round.level ? 'result.levelUp' : 'result.levelDown', { level })}
        </Text>
      )}
      <WordTiles letters={letters} available={available} compact={compact} />
      <DescriptionCard text={round.description} subject={round.subject} compact={compact} />
      <View style={styles.actions}>
        <BigButton label={t('result.nextWord')} onPress={onNext} />
        <BigButton ghost label={t('result.changeCharacter')} onPress={() => router.navigate('/characters')} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, paddingHorizontal: 16, minHeight: 0 },
  playScene: { flexGrow: 1, flexShrink: 1, maxHeight: 230 },
  resultScene: { flexGrow: 1, flexShrink: 1, maxHeight: 340 },
  over: { marginTop: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  overText: { fontFamily: fonts.display500, fontSize: 15, color: colors.muted, textAlign: 'center' },
  earned: { backgroundColor: colors.butterL, borderColor: '#ffe39a', borderWidth: 2, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 1 },
  earnedText: { fontFamily: fonts.display600, fontSize: 13, color: colors.butterT },
  levelLine: { marginTop: 6, fontFamily: fonts.display600, fontSize: 14, textAlign: 'center' },
  actions: { marginTop: 'auto', paddingTop: 8 },
});
