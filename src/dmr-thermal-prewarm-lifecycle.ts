export type StagedDmrThermalPrewarmLifecycle<State> = Readonly<{
  capture: () => State;
  stage: () => void;
  present: () => Promise<void>;
  restore: (state: State) => void;
}>;

/** Restore every captured presentation surface even when staging/submission rejects. */
export async function runStagedDmrThermalPrewarm<State>(
  lifecycle: StagedDmrThermalPrewarmLifecycle<State>,
): Promise<void> {
  const restoreState = lifecycle.capture();
  try {
    lifecycle.stage();
    await lifecycle.present();
  } finally {
    lifecycle.restore(restoreState);
  }
}
