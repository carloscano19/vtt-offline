export class DoorAnimationManager {
  private progressMap = new Map<string, number>();

  public initDoor(doorId: string, isOpen: boolean) {
    this.progressMap.set(doorId, isOpen ? 1.0 : 0.0);
  }

  public getProgress(doorId: string, isOpen: boolean): number {
    if (!this.progressMap.has(doorId)) {
      this.progressMap.set(doorId, isOpen ? 1.0 : 0.0);
    }
    return this.progressMap.get(doorId)!;
  }

  /**
   * Indica si la puerta está COMPLETAMENTE abierta (progreso >= 1.0).
   * Si está cerrándose o a mitad de apertura, devuelve false para bloquear la visión/luz.
   */
  public isFullyOpen(doorId: string, isOpen: boolean): boolean {
    if (!isOpen) return false;
    if (!this.progressMap.has(doorId)) {
      this.progressMap.set(doorId, 1.0);
    }
    return this.progressMap.get(doorId)! >= 1.0;
  }

  /**
   * Actualiza el progreso de apertura/cierre de la puerta de forma fluida en ~0.5s.
   */
  public update(doorId: string, isOpen: boolean, deltaSeconds: number): number {
    const target = isOpen ? 1.0 : 0.0;
    if (!this.progressMap.has(doorId)) {
      this.progressMap.set(doorId, deltaSeconds > 0 ? (isOpen ? 0.0 : 1.0) : target);
    }

    const current = this.progressMap.get(doorId)!;
    if (current === target) {
      return current;
    }

    const step = deltaSeconds / 0.5;
    const diff = target - current;
    const next = Math.abs(diff) <= step ? target : current + Math.sign(diff) * step;
    this.progressMap.set(doorId, next);
    return next;
  }

  public clean(currentDoorIds: Set<string>) {
    for (const id of Array.from(this.progressMap.keys())) {
      if (!currentDoorIds.has(id)) {
        this.progressMap.delete(id);
      }
    }
  }

  public reset() {
    this.progressMap.clear();
  }
}

export const doorAnimationManager = new DoorAnimationManager();
