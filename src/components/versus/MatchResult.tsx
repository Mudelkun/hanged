/*
 * A finished match: the stamp, everyone's place, score, misses and (ranked)
 * rating change, and the match's words, so everyone learns the ones they
 * missed. Then back to the lobby for a rematch, another quick match, or done.
 */
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MatchResult as Result, Standing } from '../../../server/src/versus-contract';
import { useSoundScope } from '../../audio/AudioProvider';
import { Character } from '../../characters/rig';
import { feedback } from '../../feedback';
import { SCENE_STAGES } from '../../game/config';
import { Translator, useTranslation } from '../../i18n';
import { useVersus } from '../../state/VersusContext';
import { colors, fonts } from '../../theme';
import { GameScene, Stamp } from '../GameScene';
import { display, displayName, Face, Label, MODE_LOOK, ModeChip, PillButton, versusStyles } from './parts';

const MEDALS = ['#ffc93c', '#c9d3dd', '#e3a46f'];

function scoreText(t: Translator, r: Result, s: Standing) {
  return r.mode === 'duel' ? t('versus.result.rounds', { count: s.score }) : t(s.score === 1 ? 'versus.result.word' : 'versus.result.words', { count: s.score });
}

export function MatchResult({ result, character, available, compact }: { result: Result; character: Character; available: number; compact: boolean }) {
  const t = useTranslation();
  const audio = useSoundScope();
  const { state, actions } = useVersus();
  const me = result.standings.find((s) => s.id === state.me);
  const cancelled = result.reason === 'cancelled';
  const won = !cancelled && me?.place === 1;
  const tie = won && result.standings.filter((s) => s.place === 1).length > 1;
  const look = MODE_LOOK[result.mode];

  useEffect(() => {
    if (cancelled) return;
    if (won) {
      feedback.won();
      audio.sequence([{ cue: 'win', at: 100 }, { voice: 'joy', character: character.id, at: 220, gain: 0.9 }]);
    } else {
      feedback.lost();
      audio.sequence([{ cue: 'stamp', at: 0 }, { cue: 'loss', at: 130, gain: 0.7 }]);
    }
  }, [result.matchId, cancelled, won, audio, character.id]);

  const again = () => {
    actions.dismissResult();
    actions.queue(result.mode);
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.scene, { minHeight: compact ? 120 : 160 }]}>
        <GameScene character={character} stage={won ? 0 : SCENE_STAGES} gone={won ? 0 : SCENE_STAGES} mode={won ? 'won' : 'lost'} style={styles.fill} />
        {!cancelled && (
          <Stamp
            visible
            text={won ? (tie ? t('versus.result.tie') : t('versus.result.won')) : t('versus.result.lost')}
            color={won ? colors.stampGreen : colors.stampRed}
            width={Math.min(330, available)}
          />
        )}
      </View>
      <ScrollView style={styles.fill} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.meta}>
          <ModeChip mode={result.mode} />
          <Text style={styles.metaText}>{result.ranked ? t('versus.result.ranked') : t('versus.result.friendly')}</Text>
        </View>
        {cancelled && <Text style={[versusStyles.body, versusStyles.center, styles.note]}>{t('versus.result.cancelled')}</Text>}
        {result.reason === 'forfeit' && won && <Text style={[versusStyles.body, versusStyles.center, styles.note]}>{t('versus.result.forfeit')}</Text>}
        {result.standings.map((s) => (
          <View key={s.id} style={[styles.row, s.id === state.me && styles.rowMe]}>
            <View style={[styles.place, s.place <= 3 && { backgroundColor: MEDALS[s.place - 1] }]}>
              <Text style={styles.placeText}>{s.place}</Text>
            </View>
            <Face characterId={s.characterId} size={34} />
            <View style={styles.fill}>
              <Text style={[styles.name, s.id === state.me && styles.nameMe]} numberOfLines={1}>
                {s.id === state.me ? t('versus.you') : displayName(t, s.name)}
              </Text>
              <Text style={[styles.sub, s.id === state.me && styles.subMe]}>
                {s.left ? t('versus.result.left') : t('versus.result.misses', { count: s.misses })}
                {s.rating !== undefined && ` · ${t('versus.result.rating', { rating: s.rating })}`}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.score, s.id === state.me && styles.nameMe]}>{scoreText(t, result, s)}</Text>
              {s.ratingDelta !== undefined && (
                <Text style={[styles.delta, { color: s.ratingDelta >= 0 ? colors.mintT : colors.coralD }, s.id === state.me && styles.nameMe]}>
                  {s.ratingDelta >= 0 ? `+${s.ratingDelta}` : s.ratingDelta}
                </Text>
              )}
            </View>
          </View>
        ))}
        {result.words.length > 0 && (
          <>
            <Label>{t('versus.result.theWords')}</Label>
            <View style={styles.words}>
              {result.words.map((w, i) => (
                <View key={`${w.word}${i}`} style={styles.word}>
                  <Text style={styles.wordText}>{w.word.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={styles.actions}>
        {state.lobby ? (
          <PillButton label={t('versus.result.lobby')} onPress={actions.dismissResult} color={look.main} shadow={look.dark} />
        ) : result.ranked ? (
          <PillButton label={t('versus.result.again')} onPress={again} color={look.main} shadow={look.dark} />
        ) : null}
        <View style={{ height: 8 }} />
        {!state.lobby && <PillButton label={t('versus.result.done')} onPress={actions.dismissResult} ghost cue="back" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scene: { flexShrink: 1, maxHeight: 220 },
  list: { paddingTop: 10, paddingBottom: 8, gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  metaText: { fontFamily: fonts.body800, fontSize: 12.5, color: colors.muted },
  note: { fontSize: 13.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 18, borderWidth: 2, borderColor: colors.line, paddingVertical: 7, paddingHorizontal: 10 },
  rowMe: { backgroundColor: colors.coral, borderColor: '#fff' },
  place: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.keyUsed, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  placeText: display('700', 15),
  name: display('600', 16),
  nameMe: { color: '#fff' },
  sub: { fontFamily: fonts.body700, fontSize: 12, color: colors.muted },
  subMe: { color: 'rgba(255,255,255,0.88)' },
  right: { alignItems: 'flex-end' },
  score: display('700', 15),
  delta: display('700', 13),
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  word: { backgroundColor: colors.butterL, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1.5, borderColor: '#ffe39a' },
  wordText: { ...display('600', 13.5, colors.butterT), letterSpacing: 0.5 },
  actions: { paddingTop: 6, paddingBottom: 4 },
});
