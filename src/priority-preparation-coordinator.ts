export type PreparationPriority = 'idle' | 'deployment';

export type PreparationContext = Readonly<{
  generation: number;
  checkpoint: () => Promise<void>;
}>;

export type PreparationSnapshot = Readonly<{
  generation: number;
  status: 'idle' | 'running' | 'ready' | 'failed';
  priority: PreparationPriority | null;
  escalationCount: number;
  checkpointCount: number;
  error: string | null;
}>;

type Operation = {
  generation: number;
  priority: PreparationPriority;
  promise: Promise<void>;
  releaseEscalation: () => void;
};

/** One retained preparation generation which can be accelerated, never duplicated. */
export class PriorityPreparationCoordinator {
  private operation: Operation | null = null;
  private generation = 0;
  private status: PreparationSnapshot['status'] = 'idle';
  private escalationCount = 0;
  private checkpointCount = 0;
  private error: string | null = null;

  constructor(private readonly yieldForIdleSlice: () => Promise<void>) {}

  prepare(priority: PreparationPriority, worker: (context: PreparationContext) => Promise<void>): Promise<void> {
    if (this.operation) {
      if (priority === 'deployment') this.escalate(this.operation);
      return this.operation.promise;
    }
    this.generation += 1;
    this.status = 'running';
    this.error = null;
    let releaseEscalation = () => {};
    const escalationSignal = new Promise<void>((resolve) => { releaseEscalation = resolve; });
    const operation: Operation = {
      generation: this.generation,
      priority,
      promise: Promise.resolve(),
      releaseEscalation,
    };
    const checkpoint = async (): Promise<void> => {
      if (this.operation !== operation || operation.priority === 'deployment') return;
      this.checkpointCount += 1;
      await Promise.race([this.yieldForIdleSlice(), escalationSignal]);
    };
    operation.promise = Promise.resolve()
      .then(() => worker(Object.freeze({ generation: operation.generation, checkpoint })))
      .then(() => {
        if (this.operation !== operation) return;
        this.status = 'ready';
      })
      .catch((error: unknown) => {
        if (this.operation === operation) {
          this.status = 'failed';
          this.error = error instanceof Error ? error.message : String(error);
          this.operation = null;
        }
        throw error;
      });
    this.operation = operation;
    return operation.promise;
  }

  snapshot(): PreparationSnapshot {
    return Object.freeze({
      generation: this.generation,
      status: this.status,
      priority: this.operation?.priority ?? null,
      escalationCount: this.escalationCount,
      checkpointCount: this.checkpointCount,
      error: this.error,
    });
  }

  private escalate(operation: Operation): void {
    if (operation.priority === 'deployment') return;
    operation.priority = 'deployment';
    this.escalationCount += 1;
    operation.releaseEscalation();
  }
}
