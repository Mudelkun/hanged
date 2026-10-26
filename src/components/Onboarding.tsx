import { router, Stack, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInputInstance, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sound } from '../audio';
import { useSoundScope } from '../audio/AudioProvider';
import { characterById } from '../characters/rig';
import { feedback } from '../feedback';
import { checkName, NAME_MAX, randomName } from '../game/names';
import { STARTER_CHARACTERS } from '../game/onboarding';
import { nameRules } from '../game/progress';
import { useTranslation } from '../i18n';
import { useGame } from '../state/GameContext';
import { useOnboarding } from '../state/OnboardingContext';
import { colors, fonts } from '../theme';
import { useLayout } from '../theme/layout';
import { speciesOf } from './CharacterShop';
import { Avatar } from './GameHeader';
import { checkXml, chevXml, diceXml, Icon, profileIconXml } from './icons';
import { INFO_PAGES, InfoContent, LegalPage } from './InfoPages';
import { LanguageSheet } from './LanguagePicker';
import { BuddyGlow, LiftOff, NameStage, OnboardingBalloon, OnboardingCloud, OnboardingSky, OnboardingSun } from './OnboardingArt';
import { PaperBackground } from './PaperBackground';
import { nameHelp, nameProblem, PlayerNameInput, useNameAvailability } from './PlayerNameInput';
import { Raised } from './Raised';
import { BigButton, Tile } from './RoundParts';
import { Wordmark } from './Wordmark';

const BALLOON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 24"><path d="M10 1.5c4.7 0 7.5 3.5 7.5 7.6 0 4.6-3.6 7.6-7.5 8.6-3.9-1-7.5-4-7.5-8.6 0-4.1 2.8-7.6 7.5-7.6zM8.5 19.5h3l-1.5-2z" fill="#fff"/><path d="M10 20c-1 1.4 1 2.2 0 3.5" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslation();
  return <View style={styles.dots} accessible accessibilityLabel={t('onboarding.step', { step, total: 3 })}>
    {[1, 2, 3].map(i => <View key={i} style={[styles.dot, i === step ? styles.dotOn : i < step && styles.dotDone]} />)}
  </View>;
}

function FloatingChoice({ id, selected, scale, top, onPress }: { id: string; selected: boolean; scale: number; top: number; onPress: () => void }) {
  const t = useTranslation();
  const [front] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    Animated.spring(front, { toValue: selected ? 1 : 0, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [front, selected]);
  const left = id === 'coco';
  const character = characterById(id);
  return <Animated.View style={{ position: 'absolute', left: left ? '5.82%' : '52.91%', top,
    width: 164 * scale, height: 300 * scale, zIndex: selected ? 3 : 2, transformOrigin: 'top left',
    opacity: selected ? 1 : .92, transform: [
      { translateY: front.interpolate({ inputRange: [0, 1], outputRange: [36 * scale, 0] }) },
      { scale: front.interpolate({ inputRange: [0, 1], outputRange: [236 / 300, 1] }) },
    ] }}>
    {selected && <View style={styles.glow} pointerEvents="none"><BuddyGlow /></View>}
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t('onboarding.choose', { name: character.name })}
      accessibilityState={{ selected }} style={styles.fill}>
      <OnboardingBalloon id={id} active={selected} />
    </Pressable>
    {selected && <View style={[styles.bubble, left ? { left: 4, minWidth: 160 } : { right: -4, minWidth: 105 }]} pointerEvents="none">
      <Text style={styles.bubbleText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t(id === 'coco' ? 'onboarding.coco.says' : 'onboarding.bun.says')}</Text>
      <View style={[styles.bubbleTail, left ? { left: 16 } : { right: 16 }]} />
    </View>}
  </Animated.View>;
}

export function BuddyScreen() {
  const t = useTranslation();
  const { characterId, setCharacterId } = useOnboarding();
  const audio = useSoundScope();
  const insets = useSafeAreaInsets();
  const { width, column, gutter, compact, tight, narrow, type } = useLayout();
  const [heroHeight, setHeroHeight] = useState(478);
  // The sky is full-bleed; the wordmark and the buddies are drawn for a 378 × 478 stage, scaled into
  // the column (centred on a tablet) and the hero's height
  const scale = Math.min(column / 378, heroHeight / 478);
  const logoTop = Math.max(insets.top + 8, (compact ? 42 : 58) * scale);
  const logoW = Math.round(Math.min(280 * type, Math.max(180, (compact ? 250 : 280) * Math.min(1, scale))));
  // The buddies float under the wordmark, never over it (their speech bubble is at their top)
  const choiceTop = Math.max(160 * scale, logoTop + logoW / 3 + 2);
  // A tablet's deck keeps its cards and button in the column
  const side = (width - column) / 2;
  const choose = (id: string) => {
    if (id === characterId) return;
    sound.unlock(); audio.cancel(); audio.play('choose'); audio.voice(id, 'hello');
    feedback.characterPicked(); setCharacterId(id);
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.grow} bounces={false} showsVerticalScrollIndicator={false}>
    <View style={[styles.hero, tight && styles.heroTight]} onLayout={e => e.nativeEvent.layout.height > 0 && setHeroHeight(e.nativeEvent.layout.height)}>
      <OnboardingSky />
      <View style={{ position: 'absolute', right: -36, top: 110 * scale }}><OnboardingSun /></View>
      <View style={{ position: 'absolute', left: -14, top: 148 * scale, opacity: .85 }}><OnboardingCloud width={92} /></View>
      <View style={{ position: 'absolute', right: -18, top: 250 * scale, opacity: .9 }}><OnboardingCloud width={110} /></View>
      <View style={{ position: 'absolute', left: '40%', bottom: 24, opacity: .7 }}><OnboardingCloud width={70} /></View>
      <View style={[styles.stage, { left: side, width: column }]} pointerEvents="box-none">
        <View style={[styles.logo, { top: logoTop }]} accessible accessibilityLabel={t('app.name')}>
          <Wordmark width={logoW} />
        </View>
        {STARTER_CHARACTERS.map(id => <FloatingChoice key={id} id={id} selected={id === characterId} scale={scale} top={choiceTop} onPress={() => choose(id)} />)}
      </View>
      <View style={styles.heroClouds} pointerEvents="none">
        {[150, 140, 170, 130].map((w, i) => <View key={i} style={{ position: 'absolute', left: [-10, 96, 210, 300][i], top: [38, 52, 30, 48][i] }}><OnboardingCloud width={w} /></View>)}
      </View>
    </View>
    <View style={[styles.deck, { minHeight: tight ? 0 : compact ? 300 : 360, paddingHorizontal: side + gutter, paddingBottom: Math.max(tight ? 16 : 24, insets.bottom + 8) }, tight && styles.deckTight]}>
      <View style={styles.deckPaper}><PaperBackground /></View>
      <View style={[styles.floatingTile, { right: side + 14 }]} pointerEvents="none"><Tile letter={t('onboarding.decorativeLetter')} look="clue" w={44} h={50} /></View>
      <Text style={[styles.question, tight && styles.questionTight]}>{t('onboarding.buddy.title')}</Text>
      <Text style={styles.subtitle}>{t('onboarding.buddy.subtitle')}</Text>
      <View style={styles.picks}>
        {STARTER_CHARACTERS.map(id => {
          const character = characterById(id), selected = characterId === id;
          return <Pressable key={id} onPress={() => choose(id)} accessibilityRole="radio" accessibilityState={{ checked: selected }}
            accessibilityLabel={t('onboarding.choose', { name: character.name })} style={styles.fill}>
            {({ pressed }) => <>
              <Raised depth={selected ? 5 : 4} shadowColor={selected ? colors.coralD : colors.shadow} radius={22} pressed={pressed}
                style={[styles.pick, { height: tight ? 74 : compact ? 82 : 96 }, selected && styles.pickOn]}>
                <Avatar character={character} size={narrow ? 40 : width < 370 ? 46 : 51} />
                {/* Clear of the radio in the corner (the picked one has its check outside the card) */}
                <View style={[styles.fill, !selected && styles.pickText]}>
                  <Text style={[styles.pickName, narrow && styles.pickNameNarrow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{character.name}</Text>
                  <Text style={styles.species} numberOfLines={2}>{speciesOf(character, t)}</Text>
                </View>
                {!selected && <View style={styles.radio} />}
              </Raised>
              {selected && <View style={styles.check}><Icon xml={checkXml} size={13} /></View>}
            </>}
          </Pressable>;
        })}
      </View>
      <View style={styles.spacer} />
      <BigButton label={t('onboarding.buddy.next', { name: characterById(characterId).name })} trailing={<Icon xml={chevXml('r', '#fff')} size={20} />}
        onPress={() => router.push('/onboarding/name')} />
      <View style={{ height: 6 }} /><StepDots step={2} />
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ paddingVertical: 8 }}>
        <Text style={[styles.foot, styles.link]}>{t('profile.language')}</Text>
      </Pressable>
      <Text style={[styles.foot, { marginTop: 9 }]}>{t('onboarding.buddy.footer')}</Text>
    </View>
  </ScrollView>;
}

function LegalSheet({ page, onSelect, onClose }: { page: LegalPage; onSelect: (page: LegalPage) => void; onClose: () => void }) {
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { height, column } = useLayout();
  return <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.dim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('onboarding.legal.close')} />
      <View style={[styles.sheet, { width: column, height: Math.min(560 + insets.bottom, height - insets.top - 24), paddingBottom: Math.max(28, insets.bottom + 8) }]} accessibilityViewIsModal>
        <View style={styles.grab} />
        <View style={styles.sheetHead}><View style={styles.sheetIcon}><Icon xml={profileIconXml.terms} size={22} /></View>
          <Text style={styles.sheetTitle}>{t(INFO_PAGES[page].title)}</Text></View>
        <View style={styles.legalTabs}>
          {(['terms', 'privacy'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: tab === page }}
            onPress={() => { sound.play('tab'); onSelect(tab); }} style={[styles.legalTab, tab === page && styles.legalTabOn]}>
            <Text style={[styles.legalTabText, tab === page && { color: colors.coralD }]}>{t(INFO_PAGES[tab].title)}</Text>
          </Pressable>)}
        </View>
        <ScrollView style={styles.legalBody} contentContainerStyle={{ paddingBottom: 4 }}><InfoContent page={page} /></ScrollView>
        <BigButton label={t('onboarding.legal.close')} onPress={onClose} />
      </View>
    </View>
  </Modal>;
}

export function NameScreen() {
  const t = useTranslation();
  const draft = useOnboarding();
  const { state, completeOnboarding, nameIsFree } = useGame();
  const returning = state.onboardingCompleted;
  const audio = useSoundScope();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { column, gutter, compact } = useLayout();
  const input = useRef<TextInputInstance>(null);
  const [tried, setTried] = useState(false);
  const [nudged, setNudged] = useState(false);
  const [policy, setPolicy] = useState<LegalPage | null>(null);
  const [lifting, setLifting] = useState(false);
  const [choosingLanguage, setChoosingLanguage] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));
  const check = checkName(draft.name, nameRules(state));
  const availability = useNameAvailability(nameIsFree);
  // Returning players only consent: they keep their name, so it's never judged here (a staff "Admin", or a
  // name a newer filter blocks, must not lock them out of their game).
  const nameOk = returning || (check.ok && availability.taken !== check.name);
  const problem = returning ? null : nameProblem(check, tried, availability.taken);
  const able = nameOk && draft.accepted;
  const finish = useCallback(() => completeOnboarding(draft.name, draft.characterId), [completeOnboarding, draft.name, draft.characterId]);
  useEffect(() => {
    if (!lifting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [lifting]);
  const refuseName = () => { audio.play('name-invalid'); feedback.refused(); input.current?.focus(); };
  const play = async () => {
    if (lifting || availability.checking) return;
    setTried(true);
    if (!nameOk) return refuseName();
    if (!draft.accepted) {
      setNudged(true); audio.play('name-invalid'); feedback.refused();
      shake.setValue(0);
      Animated.sequence([1, -1, .6, -.6, 0].map(toValue => Animated.timing(shake, { toValue, duration: 70, useNativeDriver: true }))).start();
      return;
    }
    // Returning players keep the name they have (no field here).
    if (!returning && check.ok && !(await availability.isFree(check.name))) return refuseName();
    Keyboard.dismiss();
    audio.play('primary');
    if (returning) { finish(); return; }
    audio.voice(draft.characterId, 'joy');
    setLifting(true);
  };
  const openPolicy = (page: LegalPage) => { Keyboard.dismiss(); audio.play('panel-open'); setPolicy(page); };
  return <View style={styles.screen}>
    <Stack.Screen options={{ gestureEnabled: !lifting }} />
    {focused && <StatusBar style={lifting ? 'light' : 'dark'} />}
    <PaperBackground />
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.namePage, { width: column, paddingHorizontal: gutter, paddingTop: insets.top, paddingBottom: Math.max(30, insets.bottom + 8) }]}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.bar}>
          {!returning && <Pressable onPress={() => { audio.play('back'); router.back(); }} accessibilityRole="button" accessibilityLabel={t('profile.back')}>
            {({ pressed }) => <Raised depth={3} shadowColor={colors.shadow} radius={15} pressed={pressed} style={styles.back}><Icon xml={chevXml('l')} size={20} /></Raised>}
          </Pressable>}
          {!returning && <View style={styles.headerDots}><StepDots step={3} /></View>}
          {returning && <Pressable accessibilityRole="button" onPress={() => setChoosingLanguage(true)}>
            <Text style={[styles.foot, styles.link]}>{t('profile.language')}</Text>
          </Pressable>}
        </View>
        <Text style={[styles.question, styles.leftQuestion]}>{t(returning ? 'onboarding.returning.title' : 'onboarding.name.title')}</Text>
        <Text style={[styles.subtitle, styles.leftSubtitle]}>{t(returning ? 'onboarding.returning.subtitle' : 'onboarding.name.subtitle')}</Text>
        <NameStage id={draft.characterId} name={draft.name} bad={!!problem} compact={compact} active={!policy && !lifting} />
        {!returning && <Raised depth={4} shadowColor={colors.shadow} radius={24} outerStyle={styles.nameCardOuter} style={styles.nameCard}>
          <Text style={styles.fieldLabel}>{t('profile.nameLabel')}</Text>
          <View style={styles.fieldRow}>
            <PlayerNameInput ref={input} value={draft.name} onChangeText={draft.setName} selectTextOnFocus
              onSubmitEditing={() => Keyboard.dismiss()} style={[styles.nameInput, problem && styles.nameInputBad]} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('profile.name.random')} onPress={() => {
              audio.play('dice'); draft.setName(randomName(undefined, state.language)); setTried(false); feedback.unlock();
            }}>
              {({ pressed }) => <Raised depth={3} shadowColor="#bfe2f8" radius={16} pressed={pressed} style={styles.dice}><Icon xml={diceXml()} size={28} /></Raised>}
            </Pressable>
          </View>
          <View style={styles.helpRow}>
            <Text style={[styles.help, problem && styles.badText]} accessibilityLiveRegion="polite">{nameHelp(problem, t)}</Text>
            <Text style={[styles.count, problem && styles.badText]}>{t('onboarding.name.count', { count: draft.name.length, max: NAME_MAX })}</Text>
          </View>
        </Raised>}
        <Animated.View style={{ marginTop: 12, transform: [{ rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ['-1.2deg', '1.2deg'] }) }] }}>
          <Raised depth={3} shadowColor={nudged && !draft.accepted ? '#f6b8ab' : colors.shadow} radius={20}
            style={[styles.consent, nudged && !draft.accepted && styles.consentNudged]}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.accepted }} accessibilityLabel={t('onboarding.accept.label')}
              hitSlop={8} onPress={() => { audio.play('tap'); draft.setAccepted(!draft.accepted); setNudged(false); }}>
              <View style={[styles.box, draft.accepted && styles.boxOn, nudged && !draft.accepted && styles.boxNudged]}>
                {draft.accepted && <Icon xml={checkXml} size={16} />}
              </View>
            </Pressable>
            <Text style={styles.consentText}>{t('onboarding.accept.prefix')}
              <Text accessibilityRole="link" style={styles.link} onPress={() => openPolicy('terms')}>{t('profile.terms')}</Text>
              {t('onboarding.accept.and')}<Text accessibilityRole="link" style={styles.link} onPress={() => openPolicy('privacy')}>{t('profile.privacy')}</Text>
              {t('onboarding.accept.suffix')}</Text>
          </Raised>
        </Animated.View>
        {nudged && !draft.accepted && <Text style={styles.nudgeText} accessibilityLiveRegion="polite">{t('onboarding.accept.nudge')}</Text>}
        <View style={styles.spacer} />
        <View style={styles.playAction}><BigButton cue={false} label={t('onboarding.play')} muted={!able} disabled={lifting}
          leading={able ? <Icon xml={BALLOON_ICON} size={20} height={24} /> : undefined} onPress={play} /></View>
        <Text style={[styles.foot, { marginTop: 4 }]}>{t(returning ? 'onboarding.returning.footer' : 'onboarding.name.footer')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    {policy && <LegalSheet page={policy} onSelect={setPolicy} onClose={() => { audio.play('panel-close'); setPolicy(null); }} />}
    {lifting && <LiftOff id={draft.characterId} onDone={finish} />}
    {choosingLanguage && <LanguageSheet onClose={() => setChoosingLanguage(false)} />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper }, fill: { flex: 1 }, spacer: { flex: 1, minHeight: 12 },
  grow: { flexGrow: 1 },
  hero: { flex: 1, minHeight: 270, overflow: 'hidden' },
  heroTight: { minHeight: 250 },
  // The wordmark and buddies' stage: the column, centred in the full-bleed sky
  stage: { position: 'absolute', top: 0, bottom: 0 },
  logo: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  glow: { position: 'absolute', width: 240, height: 240, left: -38, top: 80 },
  bubble: { position: 'absolute', top: 4, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, borderBottomWidth: 3, borderRadius: 15, paddingVertical: 5, paddingHorizontal: 11 },
  bubbleText: { fontFamily: fonts.display600, fontSize: 14.5, color: colors.ink },
  bubbleTail: { position: 'absolute', bottom: -7, width: 11, height: 11, backgroundColor: '#fff', borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.line, transform: [{ rotate: '45deg' }] },
  heroClouds: { position: 'absolute', left: -20, right: -20, bottom: -12, height: 110 },
  deck: { marginTop: -1, paddingTop: 22, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: colors.paper },
  deckPaper: { ...StyleSheet.absoluteFill, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
  floatingTile: { position: 'absolute', top: -42, transform: [{ rotate: '10deg' }], zIndex: 4 },
  question: { fontFamily: fonts.display700, fontSize: 28, lineHeight: 31, color: colors.ink, textAlign: 'center' },
  deckTight: { paddingTop: 16 },
  questionTight: { fontSize: 24, lineHeight: 27 },
  subtitle: { fontFamily: fonts.body800, fontSize: 14.5, color: colors.muted, textAlign: 'center', marginTop: 5 },
  picks: { flexDirection: 'row', gap: 12, marginTop: 16 },
  pick: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  pickOn: { borderColor: colors.coral, borderWidth: 3 },
  pickText: { paddingRight: 16 },
  pickNameNarrow: { fontSize: 18 },
  pickName: { fontFamily: fonts.display700, fontSize: 21, lineHeight: 24, color: colors.ink },
  species: { fontFamily: fonts.display500, fontSize: 13, color: colors.muted, marginTop: 3 },
  radio: { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: '#e6d5c4' },
  check: { position: 'absolute', top: -9, right: -5, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.mint, borderWidth: 3, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#ead9c4' }, dotOn: { width: 26, backgroundColor: colors.coral }, dotDone: { backgroundColor: colors.mint },
  foot: { fontFamily: fonts.body800, fontSize: 12.5, color: colors.muted, textAlign: 'center' },
  // Centred on a tablet
  namePage: { flexGrow: 1, alignSelf: 'center' },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, borderWidth: 1.5, borderColor: colors.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  headerDots: { flex: 1, marginRight: 56 },
  leftQuestion: { textAlign: 'left', fontSize: 29, lineHeight: 32 }, leftSubtitle: { textAlign: 'left', marginTop: 4 },
  nameCardOuter: { marginTop: 16 },
  nameCard: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, paddingTop: 11, paddingHorizontal: 12, paddingBottom: 10 },
  fieldLabel: { fontFamily: fonts.display600, fontSize: 12, letterSpacing: 1, color: colors.muted, marginHorizontal: 4, marginBottom: 6 },
  fieldRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nameInput: { flex: 1, minWidth: 0, height: 52, borderRadius: 16, borderWidth: 2.5, borderColor: colors.sky, backgroundColor: '#fffaf3', paddingHorizontal: 14, paddingVertical: 0, fontFamily: fonts.display700, fontSize: 23, color: colors.ink },
  nameInputBad: { borderColor: colors.coral, backgroundColor: '#fff6f3' },
  dice: { width: 52, height: 52, backgroundColor: colors.skyL, borderWidth: 2, borderColor: '#cbe8fb', justifyContent: 'center', alignItems: 'center' },
  helpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginHorizontal: 4, marginTop: 8 },
  help: { flex: 1, fontFamily: fonts.display500, fontSize: 13.5, color: colors.muted },
  count: { fontFamily: fonts.display500, fontSize: 13.5, color: colors.muted }, badText: { color: colors.coralD },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: colors.line, paddingVertical: 12, paddingHorizontal: 14 },
  consentNudged: { borderColor: colors.coral },
  box: { width: 30, height: 30, borderRadius: 10, borderWidth: 2.5, borderColor: '#dfcbb8', backgroundColor: '#fffaf3', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.mint, borderColor: colors.mint }, boxNudged: { borderColor: colors.coral, backgroundColor: '#fff6f3' },
  consentText: { flex: 1, fontFamily: fonts.body800, fontSize: 14.5, lineHeight: 20, color: colors.ink }, link: { color: colors.coralD, textDecorationLine: 'underline' },
  nudgeText: { marginTop: 8, marginHorizontal: 4, fontFamily: fonts.display600, fontSize: 13.5, color: colors.coralD, textAlign: 'center' },
  playAction: { marginTop: 8 },
  dim: { flex: 1, backgroundColor: 'rgba(75,58,53,.42)', justifyContent: 'flex-end' },
  sheet: { alignSelf: 'center', borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: colors.paper, paddingTop: 10, paddingHorizontal: 18 },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#e2d2c1', alignSelf: 'center', marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  sheetIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.skyL, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: fonts.display700, fontSize: 26, color: colors.ink },
  legalTabs: { flexDirection: 'row', backgroundColor: '#f6ebdd', borderRadius: 17, padding: 4, marginTop: 14 },
  legalTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 13 }, legalTabOn: { backgroundColor: '#fff' },
  legalTabText: { fontFamily: fonts.display600, fontSize: 15, color: '#b29c8c' }, legalBody: { flex: 1, marginTop: 14, marginBottom: 6 },
});
