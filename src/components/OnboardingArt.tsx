import { useIsFocused } from 'expo-router';
import { memo, useEffect, useId, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';
import { BalloonAnim, characterById, structureKey } from '../characters/rig';
import { LIFT_OFF_MS } from '../game/onboarding';
import { useTranslation } from '../i18n';
import { colors, fonts } from '../theme';
import { cloudXml, Icon } from './icons';
import { WoodenSign } from './WoodenSign';

export function OnboardingSky({ rush = false }: { rush?: boolean }) {
  const id = useId();
  return <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={rush ? '#5db4f2' : '#8fd3ff'} />
      <Stop offset="0.45" stopColor={rush ? '#8fd3ff' : '#bfe6ff'} />
      <Stop offset="1" stopColor={rush ? '#d2eeff' : '#e6f6ff'} />
    </LinearGradient></Defs>
    <Rect width="100%" height="100%" fill={`url(#${id})`} />
  </Svg>;
}

export function OnboardingSun({ size = 52 }: { size?: number }) {
  return <Svg width={size + 44} height={size + 44} viewBox="-22 -22 96 96">
    <Circle cx="26" cy="26" r="48" fill="#ffe27a" opacity={0.16} />
    <Circle cx="26" cy="26" r="36" fill="#ffe27a" opacity={0.35} />
    <Circle cx="26" cy="26" r="26" fill="#ffe27a" />
  </Svg>;
}

export const OnboardingCloud = memo(function OnboardingCloud({ width }: { width: number }) {
  return <Icon xml={cloudXml()} size={width} height={width / 2} />;
});

export function BuddyGlow() {
  const id = useId();
  return <Svg width="100%" height="100%" viewBox="0 0 240 240">
    <Defs><RadialGradient id={id}><Stop offset="0" stopColor="#fff" stopOpacity={0.95} />
      <Stop offset="0.38" stopColor="#fff" stopOpacity={0.55} /><Stop offset="0.7" stopColor="#fff" stopOpacity={0} />
    </RadialGradient></Defs><Circle cx="120" cy="120" r="120" fill={`url(#${id})`} />
  </Svg>;
}

/** Same frame edits and view boxes as design/onboarding/onboarding.html. */
export const OnboardingBalloon = memo(function OnboardingBalloon({ id, pose = 'float', active = true, worried = false, fit }: {
  id: string; pose?: 'float' | 'stand' | 'lift'; active?: boolean; worried?: boolean; fit?: 'meet' | 'slice';
}) {
  const focused = useIsFocused();
  const [time, setTime] = useState(0.35);
  useEffect(() => {
    if (!active || !focused) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer) return;
      const began = performance.now();
      timer = setInterval(() => setTime(0.35 + (performance.now() - began) / 1000), 50);
    };
    const stop = () => { clearInterval(timer); timer = undefined; };
    if (AppState.currentState === 'active' || AppState.currentState === null) start();
    const sub = AppState.addEventListener('change', state => state === 'active' ? start() : stop());
    return () => { stop(); sub.remove(); };
  }, [active, focused]);
  const frame = BalloonAnim.frame(0, 0, 1, time);
  frame.expr = worried ? 'worried' : active ? 'joy' : 'happy';
  if (pose === 'stand') {
    frame.tx = 330; frame.ty = 546; frame.rot = 0;
    if (worried) frame.a.armL = 20;
  }
  if (pose === 'lift') { frame.a.armL = 150; frame.rot = -4; }
  const xml = BalloonAnim.scene(characterById(id), frame, { sky: false, clouds: false })
    .replace(' class="balloon-scene"', '')
    .replace(/viewBox="[^"]*"/, `viewBox="${pose === 'stand' ? '0 290 450 300' : '118 2 180 330'}"`);
  return <SvgXml key={structureKey(xml)} xml={xml} width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio={`xMidYMax ${fit ?? (pose === 'stand' ? 'slice' : 'meet')}`} />;
});

export function NameStage({ id, name, bad, compact, active = true }: { id: string; name: string; bad: boolean; compact: boolean; active?: boolean }) {
  const [width, setWidth] = useState(340);
  const [tilt] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(tilt, { toValue: bad ? 1 : 0, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [bad, tilt]);
  const signWidth = Math.min(width * 0.59, Math.max(120, name.length * 15 + 34));
  const scale = (compact ? 180 : 226) / 226;
  return <View style={[styles.stage, { height: compact ? 186 : 232 }]} onLayout={e => setWidth(e.nativeEvent.layout.width - 6)}>
    <OnboardingSky />
    <View style={{ position: 'absolute', left: 0, top: -4 }}><OnboardingSun size={40} /></View>
    <View style={{ position: 'absolute', left: '28%', top: 30 }}><OnboardingCloud width={70} /></View>
    <View style={{ position: 'absolute', left: '53%', top: 12, opacity: .75 }}><OnboardingCloud width={46} /></View>
    <OnboardingBalloon id={id} pose="stand" worried={bad} active={active} fit={compact ? 'meet' : 'slice'} />
    <View style={[styles.post, { left: width * .294 - signWidth / 2 + 24, top: 118 * scale, height: 92 * scale }]} />
    <View style={[styles.post, { left: width * .294 + signWidth / 2 - 34, top: 118 * scale, height: 92 * scale }]} />
    <Animated.View style={{ position: 'absolute', width: signWidth, left: width * .294 - signWidth / 2, top: 96 * scale,
      transformOrigin: '12px 10px', transform: [{ rotate: tilt.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-13deg'] }) }] }}>
      <WoodenSign radius={14} style={styles.sign}>
        <View style={[styles.nail, { left: 6 }]} /><View style={[styles.nail, { right: 6 }]} />
        <Text style={[styles.signText, { fontSize: Math.min(25, (signWidth - 28) / Math.max(1, name.length) / .62) }, bad && { color: '#b4573f' }]}
          numberOfLines={1}>{name || ' '}</Text>
      </WoodenSign>
    </Animated.View>
  </View>;
}

const SPEED = [[30, 120, 90], [64, 380, 130], [98, 610, 70], [300, 90, 120], [336, 330, 90], [270, 560, 140], [180, 700, 80], [350, 640, 60], [20, 520, 70]];

export function LiftOff({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useTranslation();
  const [flight] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(flight, { toValue: 1, duration: LIFT_OFF_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) onDone(); });
    return () => animation.stop();
  }, [flight, onDone]);
  return <View style={styles.lift} accessibilityViewIsModal>
    <OnboardingSky rush />
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: flight.interpolate({ inputRange: [0, 1], outputRange: [-180, 320] }) }] }]}>
      {SPEED.map(([x, y, h], i) => <View key={i} style={[styles.speed, { left: `${x / 378 * 100}%`, top: y, height: h }]} />)}
      <View style={{ position: 'absolute', left: -30, top: 160, opacity: .55 }}><OnboardingCloud width={120} /></View>
      <View style={{ position: 'absolute', right: -40, top: 470, opacity: .7 }}><OnboardingCloud width={150} /></View>
    </Animated.View>
    <Text style={styles.liftTitle}>{t('onboarding.lift.title')}</Text>
    {[.12, .22, 1].map((opacity, i) => <Animated.View key={i} style={[styles.liftBuddy, { opacity,
      transform: [{ translateY: flight.interpolate({ inputRange: [0, .65, 1], outputRange: [300 + (2 - i) * 70, 0 + (2 - i) * 70, -220] }) }] }]}>
      <OnboardingBalloon id={id} pose="lift" active={i === 2} />
    </Animated.View>)}
    <Animated.View style={[styles.cloudBank, { transform: [{ translateX: flight.interpolate({ inputRange: [0, 1], outputRange: [0, -90] }) }] }]}>
      <OnboardingCloud width={190} /><View style={{ marginLeft: -65, marginBottom: 20 }}><OnboardingCloud width={210} /></View>
      <View style={{ marginLeft: -65 }}><OnboardingCloud width={190} /></View>
    </Animated.View>
    <Text style={styles.liftSubtitle}>{t('onboarding.lift.subtitle')}</Text>
  </View>;
}

const styles = StyleSheet.create({
  stage: { marginTop: 14, borderRadius: 28, borderWidth: 3, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#bfe6ff' },
  post: { position: 'absolute', width: 10, borderRadius: 4, backgroundColor: '#c79560', borderWidth: 2, borderColor: '#9c6a3c' },
  sign: { paddingHorizontal: 14, paddingTop: 5, paddingBottom: 4 },
  signText: { fontFamily: fonts.display700, color: colors.ink, textAlign: 'center' },
  nail: { position: 'absolute', top: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: '#b98450' },
  lift: { ...StyleSheet.absoluteFill, zIndex: 20, overflow: 'hidden' },
  speed: { position: 'absolute', width: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.75)' },
  liftTitle: { position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', fontFamily: fonts.display700, fontSize: 40, color: '#fff', textShadowColor: 'rgba(42,134,200,.55)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  liftBuddy: { position: 'absolute', top: '23%', left: '27.5%', width: '45%', height: 300 },
  cloudBank: { position: 'absolute', bottom: -20, left: -40, flexDirection: 'row', alignItems: 'flex-end' },
  liftSubtitle: { position: 'absolute', left: 0, right: 0, bottom: 46, textAlign: 'center', fontFamily: fonts.display600, fontSize: 17, color: colors.skyT },
});
