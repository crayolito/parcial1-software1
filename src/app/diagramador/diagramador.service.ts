import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { WebsocketService } from '../common/services/websocket.service';
import { HomeService } from '../home/home.service';

@Injectable({
  providedIn: 'root',
})
export class DiagramadorService {
  private apiUrl = environment.apiUrl;
  public http = inject(HttpClient);
  public wsService = inject(WebsocketService);
  public userAuth = inject(HomeService);

  onListenChangedDiagrama() {
    return this.wsService.listen('changed-diagrama');
  }

  emitChangedDiagrama(diagrama: string) {
    this.wsService.emit('changed-diagrama', {
      id: this.userAuth.getSalaDiagrama()!.id,
      diagrama,
    });
  }

  contenidoVerifDiagramaBD(nombreSala: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/salas/` + nombreSala);
  }
}
