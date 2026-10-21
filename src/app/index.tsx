/*
 * The Play screen. It shows one of two layouts for the current round:
 *   - playing: scene, misses, word, hint words, letter shop (hardest levels), description, keyboard
 *   - result (won or lost): bigger scene with the stamp, the full word,
 *     the description and "Next word" (mockup: Round lost)
 * When the round ends, the play layout stays a moment so the last
 * animation (the fall, or the last tile popping) can be seen first. A win
 * that makes a streak plays the streak takeover over it, which dissolves
 * onto the result.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { characterById } from '../characters/rig';
import { GameHeader } from '../components/GameHeader';
import { GameScene, Stamp } from '../components/GameScene';
import { LetterKeyboard } from '../components/LetterKeyboard';
import { LevelChange } from '../components/LevelChange';
import { PaperBackground } from '../components/PaperBackground';
import { BigButton, DescriptionCard, HintPill, LetterShopPill, MissesBar, TileLook, WordTiles } from '../components/RoundParts';
import { STREAK_SHOWN_FROM, StreakTakeover } from '../components/StreakTakeover';
import { TabBar } from '../components/TabBar';
import { useTokenOrigin } from '../components/TokenFlight';
import { DESCRIPTION_COST, LETTER_BUY_COST } from '../game/config';
import { balloonsGone, balloonsLeft, sceneStage, keyState, Letter, Round, roundStatus, tileState, usedLetters, wrongCount } from '../game/engine';
import { levelByNumber } from '../game/levels';
import { lettersForSale } from '../game/progress';
import { feedback } from '../feedback';
import { t } from '../i18n';
import { useGame } from '../state/GameContext';
import { colors, fonts, levelColor } from '../theme';

// Lost waits for the last balloon to pop and the character to hit the ground (stage 10 is 2200 ms)
const RESULT_DELAY = { lost: 2600, won: 700 };

export default function PlayScreen() {
  const { state, dispatch, startNextRound } = useGame();
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
  }, [round.id]);

  // A round that moved the level plays the level path over its result. Until the
  // character lands on the new stop, the header keeps showing the round's level.
  const level = state.levelProgress.level;
  const levelMoved = status !== 'playing' && level !== round.level && round.id !== restoredId;
  const [landedFor, setLandedFor] = useState<string | null>(null);
  const onLevelLanded = useCallback(() => setLandedFor(round.id), [round.id]);

  const streak = state.streak;
  useEffect(() => {
    if (status === 'playing' || resultFor === round.id || streakFor === round.id) return;
    if (status === 'won') feedback.won();
    else feedback.lost();
    const celebrate = status === 'won' && streak >= STREAK_SHOWN_FROM;
    const id = setTimeout(() => (celebrate ? setStreakFor(round.id) : revealResult()), RESULT_DELAY[status]);
    return () => clearTimeout(id);
  }, [status, round.id, resultFor, streakFor, streak, revealResult]);

  const onKey = useCallback(
    (c: Letter) => {
      if (roundStatus(round) !== 'playing' || usedLetters(round).has(c)) return;
      dispatch({ type: 'guess', letter: c });
    },
    [round, dispatch],
  );

  const onUnlock = useCallback(() => {
    feedback.unlock();
    dispatch({ type: 'unlockDescription' });
  }, [dispatch]);

  const onBuyLetters = useCallback(() => {
    feedback.unlock();
    dispatch({ type: 'buyLetters' });
  }, [dispatch]);

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
            onNext={startNextRound}
          />
        ) : (
          <>
            <GameScene
              key={round.id}
              character={character}
              stage={sceneStage(round)}
              gone={balloonsGone(round)}
              mode="play"
              style={[styles.playScene, { minHeight: compact ? 96 : 130 }]}
              accessibilityLabel={t('play.a11y.scene', { name: character.name, left: balloonsLeft(round) })}
            />
            <MissesBar wrong={wrongCount(round)} max={round.maxWrong} />
            <WordTiles
              letters={round.word.split('').map((c) => ({ letter: c, look: tileState(round, c) as TileLook }))}
              available={available}
              compact={compact}
            />
            <HintPill key={`hint-${round.id}`} hints={round.hints} compact={compact} />
            {levelByNumber(round.level).sellsLetters && (
              <LetterShopPill
                bought={round.boughtLetters.length > 0}
                canAfford={lettersForSale(state) ? state.tokens >= LETTER_BUY_COST : null}
                onBuy={onBuyLetters}
                compact={compact}
              />
            )}
            <DescriptionCard
              text={round.description}
              unlocked={round.descriptionUnlocked}
              canAfford={status === 'playing' ? state.tokens >= DESCRIPTION_COST : null}
              onUnlock={onUnlock}
              compact={compact}
            />
            <View style={[styles.keyboardWrap, { paddingTop: compact ? 8 : 12 }]}>
              <LetterKeyboard
                keyState={(c) => keyState(round, c)}
                locked={status !== 'playing'}
                onPress={onKey}
                available={available}
                compact={compact}
              />
            </View>
          </>
        )}
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
      {/* Its button deals the next word, so the new round unmounts it: one tap, not two */}
      {showResult && levelMoved && (
        <LevelChange
          key={round.id}
          from={round.level}
          to={level}
          character={character}
          width={available}
          compact={compact}
          onLanded={onLevelLanded}
          onClose={startNextRound}
        />
      )}
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
    look: (won ? tileState(round, c) : used.has(c) ? 'ok' : 'miss') as TileLook,
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
      <DescriptionCard text={round.description} unlocked canAfford={null} compact={compact} />
      <View style={styles.actions}>
        <BigButton label={t('result.nextWord')} onPress={onNext} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, paddingHorizontal: 16, minHeight: 0 },
  playScene: { flexGrow: 1, flexShrink: 1, maxHeight: 230 },
  keyboardWrap: { marginTop: 'auto' },
  // Taller than the mockup's 282: there is no "Change character" button until the Characters page exists
  resultScene: { flexGrow: 1, flexShrink: 1, maxHeight: 340 },
  over: { marginTop: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  overText: { fontFamily: fonts.display500, fontSize: 15, color: colors.muted, textAlign: 'center' },
  earned: { backgroundColor: colors.butterL, borderColor: '#ffe39a', borderWidth: 2, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 1 },
  earnedText: { fontFamily: fonts.display600, fontSize: 13, color: colors.butterT },
  levelLine: { marginTop: 6, fontFamily: fonts.display600, fontSize: 14, textAlign: 'center' },
  actions: { marginTop: 'auto', paddingTop: 8 },
});
