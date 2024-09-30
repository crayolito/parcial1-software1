import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment.prod';
import { WebsocketService } from '../common/services/websocket.service';

export interface UserAuth {
  id: number;
  email: string;
  password: string;
}

export interface SalaDiagrama {
  id: number;
  nombre: string;
  host: string;
}

export enum StatusAuth {
  Autenticado,
  NoAutenticado,
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private _statusClient = signal<StatusAuth>(StatusAuth.NoAutenticado);
  private _userAuth = signal<UserAuth | null>(null);
  private _salaDiagrama = signal<SalaDiagrama | null>(null);

  constructor(private http: HttpClient, private wsService: WebsocketService) {}

  setSalaDiagrama(salaDiagrama: SalaDiagrama): void {
    this._salaDiagrama.set(salaDiagrama);
  }

  getSalaDiagrama(): SalaDiagrama | null {
    return this._salaDiagrama();
  }

  getStatusClient(): StatusAuth {
    return this._statusClient();
  }

  setStatusClient(status: StatusAuth): void {
    this._statusClient.set(status);
  }

  getUserAuth(): UserAuth | null {
    return this._userAuth();
  }

  setUserAuth(userAuth: UserAuth): void {
    this._userAuth.set(userAuth);
  }

  procesoLogin(email: string, password: string): Observable<UserAuth> {
    return this.http
      .post<UserAuth>(`${this.apiUrl}/users/confirm-login`, {
        email,
        password,
      })
      .pipe(
        map((response: any) => {
          console.log(response);
          return {
            id: response.id,
            email: response.email,
            password: response.password,
          } as UserAuth;
        })
      );
  }

  procesoRegistro(email: string, password: string): Observable<UserAuth> {
    return this.http
      .post<UserAuth>(`${this.apiUrl}/users`, {
        email,
        password,
      })
      .pipe(
        map((response: any) => {
          console.log(response);
          return {
            id: response.id,
            email: response.email,
            password: response.password,
          } as UserAuth;
        })
      );
  }

  cerrarSesion(): void {
    this._statusClient.set(StatusAuth.NoAutenticado);
    this._userAuth.set(null);
  }

  newReunion(): void {}

  unirmReunion(): void {}

  onListenRespNuevaReunion() {
    return this.wsService.listen('nueva-reunion');
  }

  onListenRespUnirseReunion() {
    return this.wsService.listen('unirse-reunion');
  }

  emitNuevaReunion(idUser: number, nameSala: string) {
    this.wsService.emit('nueva-reunion', {
      id: idUser,
      nombre: nameSala,
    });
  }

  emitUnirseReunion(idUser: number, nameSala: string) {
    this.wsService.emit('unirse-reunion', {
      id: idUser,
      nombre: nameSala,
    });
  }
}
