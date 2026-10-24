/*
 * "Keep your streak going?": the app's own question before the OS's
 * notification prompt, which iOS shows only once. Asked once, over the
 * result of the player's first won round (play-screen.md). Closing the sheet
 * counts as "Not now"; Profile's switch changes the answer later.
 */
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Character, faceXml } from '../characters/rig';
import { useTranslation } from '../i18n';
import { characterTint, colors, fonts } from '../theme';
import { Icon, profileIconXml } from './icons';
import { BigButton } from './RoundParts';
import { Sheet, sheetText } from './Sheet';

export function ReminderSheet({ character, onAnswer }: { character: Character; onAnswer: (yes: boolean) => void }) {
  const t = useTranslation();
  return (
    <Sheet onClose={() => onAnswer(false)} closeLabel={t('reminderAsk.no')}>
      <View style={[styles.face, { backgroundColor: characterTint[character.id] ?? colors.flameL }]}>
        <SvgXml xml={faceXml(character, 'joy')} width={74} height={74} />
      </View>
      <Text style={sheetText.title} accessibilityRole="header">{t('reminderAsk.title')}</Text>
      <Text style={sheetText.help}>{t('reminderAsk.body', { name: character.name })}</Text>
      <BigButton label={t('reminderAsk.yes')} onPress={() => onAnswer(true)} leading={<Icon xml={profileIconXml.reminders} size={20} />} />
      <BigButton ghost label={t('reminderAsk.no')} onPress={() => onAnswer(false)} />
      <Text style={styles.note}>{t('reminderAsk.note')}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  face: { alignSelf: 'center', width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  note: { fontFamily: fonts.body700, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 },
});
