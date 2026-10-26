import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase/supabaseClient';

export type AuthListener = (user: User | null, session: Session | null) => void;

class AuthManager {
  private currentUser: User | null = null;
  private currentSession: Session | null = null;
  private listeners: Set<AuthListener> = new Set();
  private initialized = false;

  constructor() {
    if (supabase) {
      // Obtener sesión inicial
      supabase.auth.getSession().then(({ data: { session } }) => {
        this.currentSession = session;
        this.currentUser = session?.user ?? null;
        this.initialized = true;
        this.notifyListeners();
      });

      // Escuchar cambios de autenticación
      supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        this.currentSession = session;
        this.currentUser = session?.user ?? null;
        this.initialized = true;
        this.notifyListeners();
      });
    } else {
      this.initialized = true;
    }
  }

  public isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  public isReady(): boolean {
    return this.initialized;
  }

  public getUser(): User | null {
    return this.currentUser;
  }

  public getSession(): Session | null {
    return this.currentSession;
  }

  public isAuthenticated(): boolean {
    return Boolean(this.currentUser);
  }

  public onAuthStateChange(listener: AuthListener): () => void {
    this.listeners.add(listener);
    if (this.initialized) {
      listener(this.currentUser, this.currentSession);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentUser, this.currentSession);
      } catch (err) {
        console.error('[authManager] Error en listener de auth:', err);
      }
    }
  }

  /**
   * Iniciar sesión con email y contraseña
   */
  public async signInWithPassword(email: string, password: string):Promise<{ error: Error | null }> {
    if (!supabase) {
      return { error: new Error('Supabase no está configurado. Revisa tu archivo .env.local') };
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      return { error: error ? new Error(error.message) : null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /**
   * Registro con email y contraseña, con redirección al origen de la VTT
   */
  public async signUpWithPassword(email: string, password: string): Promise<{ error: Error | null; needsEmailConfirmation?: boolean }> {
    if (!supabase) {
      return { error: new Error('Supabase no está configurado. Revisa tu archivo .env.local') };
    }
    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });
      if (error) {
        return { error: new Error(error.message) };
      }
      const needsEmailConfirmation = !data.session;
      return { error: null, needsEmailConfirmation };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /**
   * Enlace mágico (Magic Link OTP) al email del usuario, con redirección al origen de la VTT
   */
  public async signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
    if (!supabase) {
      return { error: new Error('Supabase no está configurado. Revisa tu archivo .env.local') };
    }
    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectUrl
        }
      });
      return { error: error ? new Error(error.message) : null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /**
   * Cerrar sesión
   */
  public async signOut(): Promise<{ error: Error | null }> {
    if (!supabase) return { error: null };
    try {
      const { error } = await supabase.auth.signOut();
      return { error: error ? new Error(error.message) : null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }
}

export const authManager = new AuthManager();
