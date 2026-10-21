/*
 * The Play screen. It shows one of two layouts for the current round:
 *   - playing: scene, misses, word, description, token bar, keyboard
 *   - result (won or lost): bigger scene with the stamp, the full word,
 *     the description, token bar and "Next word" (mockup: Round lost)
 * When the round ends, the play layout stays a moment so the last
 * animation (the fall, or the last tile popping) can be seen first.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { characterById } from '../characters/rig';
import { GameHeader } from '../components/GameHeader';
import { HangingScene, PLAY_VIEWBOX, RESULT_VIEWBOX, Stamp } from '../components/HangingScene';
import { LetterKeyboard } from '../components/LetterKeyboard';
import { PaperBackground } from '../components/PaperBackground';
import { BigButton, DescriptionCard, MissesBar, TileLook, TokenBar, WordTiles } from '../components/RoundParts';
import { TabBar } from '../components/TabBar';
import { DESCRIPTION_COST } from '../game/config';
import { hangingStage, keyState, Letter, Round, roundStatus, tileState, usedLetters, wrongCount } from '../game/engine';
import { levelNumberFor } from '../game/levels';
import { feedback } from '../feedback';
import { t } from '../i18n';
import { useGame } from '../state/GameContext';
import { colors, fonts } from '../theme';

const RESULT_DELAY = { lost: 1400, won: 700 };

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

  // A round restored already finished goes straight to its result.
  const [resultFor, setResultFor] = useState<string | null>(status === 'playing' ? null : round.id);
  const showResult = resultFor === round.id;

  useEffect(() => {
    if (status === 'playing' || resultFor === round.id) return;
    if (status === 'won') feedback.won();
    else feedback.lost();
    const id = setTimeout(() => {
      setResultFor(round.id);
      feedback.stamp();
    }, RESULT_DELAY[status]);
    return () => clearTimeout(id);
  }, [status, round.id, resultFor]);

  const onKey = useCallback(
    (c: Letter) => {
      if (roundStatus(round) !== 'playing' || usedLetters(round).has(c)) return;
      if (round.word.includes(c)) feedback.correct();
      else feedback.wrong();
      dispatch({ type: 'guess', letter: c });
    },
    [round, dispatch],
  );

  const onUnlock = useCallback(() => {
    feedback.unlock();
    dispatch({ type: 'unlockDescription' });
  }, [dispatch]);

  return (
    <View style={styles.screen}>
      <PaperBackground />
      <View style={{ height: insets.top }} />
      <GameHeader
        name={playerName}
        character={character}
        wordsGuessed={state.wordsGuessed}
        level={levelNumberFor(state.wordsGuessed)}
        tokens={state.tokens}
      />
      <View style={styles.body}>
        {showResult ? (
          <ResultView
            round={round}
            status={status === 'won' ? 'won' : 'lost'}
            characterName={character.name}
            character={character}
            tokenProgress={state.wordsTowardToken}
            tokenEarned={state.lastTokenEarned}
            available={available}
            compact={compact}
            onNext={startNextRound}
          />
        ) : (
          <>
            <HangingScene
              key={round.id}
              character={character}
              stage={hangingStage(round)}
              mode="play"
              viewBox={PLAY_VIEWBOX}
              style={[styles.playScene, { minHeight: compact ? 96 : 130 }]}
              accessibilityLabel={t('play.a11y.scene', { name: character.name, stage: hangingStage(round) })}
            />
            <MissesBar wrong={wrongCount(round)} max={round.maxWrong} />
            <WordTiles
              letters={round.word.split('').map((c) => ({ letter: c, look: tileState(round, c) as TileLook }))}
              available={available}
              compact={compact}
            />
            <DescriptionCard
              text={round.description}
              unlocked={round.descriptionUnlocked}
              canAfford={status === 'playing' ? state.tokens >= DESCRIPTION_COST : null}
              onUnlock={onUnlock}
              compact={compact}
            />
            <TokenBar progress={state.wordsTowardToken} />
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
      </View>
      <TabBar active="play" compact={compact} />
    </View>
  );
}

function ResultView({ round, status, character, characterName, tokenProgress, tokenEarned, available, compact, onNext }: {
  round: Round;
  status: 'won' | 'lost';
  character: ReturnType<typeof characterById>;
  characterName: string;
  tokenProgress: number;
  tokenEarned: boolean;
  available: number;
  compact: boolean;
  onNext: () => void;
}) {
  const used = usedLetters(round);
  const wrong = wrongCount(round);
  const won = status === 'won';
  const letters = round.word.split('').map((c) => ({
    letter: c,
    // Lost: what was found turns mint, what was missed turns coral (mockup)
    look: (won ? tileState(round, c) : used.has(c) ? 'ok' : 'miss') as TileLook,
  }));

  return (
    <>
      <View style={[styles.resultScene, { minHeight: compact ? 140 : 180 }]}>
        <HangingScene
          character={character}
          stage={hangingStage(round)}
          mode={status}
          viewBox={RESULT_VIEWBOX}
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
        {won && tokenEarned && (
          <View style={styles.earned}>
            <Text style={styles.earnedText}>{t('result.tokenEarned')}</Text>
          </View>
        )}
      </View>
      <WordTiles letters={letters} available={available} compact={compact} />
      <DescriptionCard text={round.description} unlocked canAfford={null} compact={compact} />
      <TokenBar progress={tokenProgress} />
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
  actions: { marginTop: 'auto', paddingTop: 8 },
});
