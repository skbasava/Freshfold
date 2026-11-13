export type ConnectivityListener = (isOnline: boolean) => void;

export class ConnectivityManager {
  private online: boolean;
  private listeners: Set<ConnectivityListener> = new Set();
  private isBrowser: boolean;

  constructor() {
    this.isBrowser =
      typeof window !== 'undefined' && typeof window.addEventListener === 'function';
    this.online =
      typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
        ? navigator.onLine
        : true;

    if (this.isBrowser) {
      window.addEventListener('online', () => this.updateStatus(true));
      window.addEventListener('offline', () => this.updateStatus(false));
    }
  }

  public isConnected(): boolean {
    return this.online;
  }

  public isOnline(): boolean {
    return this.online;
  }

  public subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    // Notify immediately with current state
    listener(this.online);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onStatusChange(listener: ConnectivityListener): () => void {
    return this.subscribe(listener);
  }

  public setMockOnline(status: boolean): void {
    this.updateStatus(status);
  }

  private updateStatus(status: boolean): void {
    if (this.online === status) return;
    this.online = status;
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('Error in connectivity listener:', err);
      }
    }
  }
}

export const connectivity = new ConnectivityManager();

