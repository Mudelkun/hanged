import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Character } from '../characters/rig';
import { WELCOME_MS } from '../game/onboarding';
import { t } from '../i18n';
import { colors, fonts } from '../theme';
import { Avatar } from './GameHeader';
import { Raised } from './Raised';

export function WelcomeToast({ name, character, onDone }: { name: string; character: Character; onDone: () => void }) {
  const [show] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(show, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(WELCOME_MS - 440),
      Animated.timing(show, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => { if (finished) onDone(); });
    return () => animation.stop();
  }, [show, onDone]);
  return <Animated.View pointerEvents="none" style={[styles.position, { opacity: show,
    transform: [{ translateY: show.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }]}>
    <Raised depth={5} shadowColor="#a5dfc4" radius={20} style={styles.card}>
      <Avatar character={character} size={39} />
      <View style={styles.text} accessibilityLiveRegion="polite">
        <Text style={styles.title}>{t('profile.name.saved', { name })}</Text>
        <Text style={styles.subtitle}>{t('onboarding.welcome.subtitle')}</Text>
      </View>
    </Raised>
  </Animated.View>;
}

const styles = StyleSheet.create({
  position: { position: 'absolute', left: 12, right: 12, bottom: 178, zIndex: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 2, borderColor: '#bdecd6', paddingVertical: 8, paddingLeft: 8, paddingRight: 12 },
  text: { flex: 1 },
  title: { fontFamily: fonts.display700, fontSize: 18, lineHeight: 20, color: colors.mintT },
  subtitle: { fontFamily: fonts.body800, fontSize: 12.5, color: colors.muted, marginTop: 1 },
});
