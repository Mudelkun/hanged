/*
 * The only code that talks to the OS about store reviews. Apple and Google
 * only allow their own in-app prompt (SKStoreReviewController, Play In-App
 * Review): no "Do you like Hanged?" screen of ours first, and never a link out
 * to the store, which would leave the game. The OS decides whether the prompt
 * shows (iOS: at most 3 times a year) and never says what the player did.
 */
import * as StoreReview from 'expo-store-review';

/**
 * Asks the OS for its review prompt. `onAsked` runs just before it opens (on
 * Android the request only resolves once the player closes it), so the save
 * says "asked" at once. When the store has no in-app prompt here (web,
 * TestFlight, no Play Store) nothing shows, and a later win may try again.
 */
export async function askForReview(onAsked: () => void): Promise<void> {
  try {
    if (!(await StoreReview.isAvailableAsync())) return;
    onAsked();
    await StoreReview.requestReview();
  } catch {
    // A prompt that can't show is only a missed review: play never waits on it.
  }
}
