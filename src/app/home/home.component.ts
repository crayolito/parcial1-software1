import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { BrowserMultiFormatReader } from '@zxing/library';
import { Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { HomeService } from './../home/home.service';
import { SalaDiagrama, StatusAuth, UserAuth } from './home.service';
export enum ViewTypeForm {
  login,
  register,
}

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, CommonModule, ReactiveFormsModule],
  templateUrl: './home.component.html',
})
export default class HomeComponent implements OnInit, OnDestroy, AfterViewInit {
  onListenRespUnirseReunion!: Subscription;
  onListenRespNuevaReunion!: Subscription;
  public serviceAuth = inject(HomeService);
  public formBuilder = inject(FormBuilder);
  public router = inject(Router);
  public viewFormAuth = signal<boolean>(false);
  public infoDate = signal<Date>(new Date());
  public viewFormLogin = signal<boolean>(false);

  public inputCodigoSala: string = '';
  // READ : PROPIEDADES DEL MODAL
  public modalCustomView = signal<boolean>(false);
  public messageModalCustom = signal<string>('');
  private codeReader = new BrowserMultiFormatReader();

  // READ : FORMULARIO LOGIN
  public myFormLogin: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  // READ : FORMULARIO REGISTER
  public myFormRegister: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
    passwordConfirm: ['', [Validators.required]],
  });

  ngOnInit(): void {
    setInterval(() => this.infoDate.update(() => new Date()), 1000);
    //LOGIC: VERIFICAR SI EXISTE INFORMACION DEL USUARIO EN EL LOCALSTORAGE
    const userAuth = localStorage.getItem('userAuth');
    if (userAuth) {
      this.serviceAuth.setUserAuth(JSON.parse(userAuth));
      this.serviceAuth.setStatusClient(StatusAuth.Autenticado);
    }

    // READ: EVENTOS DE ESCUCHA
    this.onListenRespUnirseReunion = this.serviceAuth
      .onListenRespUnirseReunion()
      .subscribe((data: any) => {
        // LOGIC : Verificar que los datos tengan el formato esperado
        if (!data.id || !data.nombre || !data.host) {
          this.messageModalCustom.set('Error al unirse a la sala de reunión');
          this.modalCustomView.set(true);
        }
        let salaDiagrama: SalaDiagrama = {
          id: data.id,
          nombre: data.nombre,
          host: data.host,
        };
        this.serviceAuth.setSalaDiagrama(salaDiagrama);
        // LOGIC : REDIRECCIONAR A LA SALA DE REUNION
        this.router.navigate(['/uml', data.nombre]);
      });

    this.onListenRespNuevaReunion = this.serviceAuth
      .onListenRespNuevaReunion()
      .subscribe((data: any) => {
        // LOGIC : Verificar que los datos tengan el formato esperado
        if (!data.id || !data.nombre || !data.host) {
          this.messageModalCustom.set('Error al crear la sala de reunión');
          this.modalCustomView.set(true);
        }
        let salaDiagrama: SalaDiagrama = {
          id: data.id,
          nombre: data.nombre,
          host: data.host,
        };

        this.serviceAuth.setSalaDiagrama(salaDiagrama);
        // LOGIC : REDIRECCIONAR A LA SALA DE REUNION
        this.router.navigate(['/uml', data.nombre]);
      });
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.onListenRespUnirseReunion.unsubscribe();
    this.onListenRespNuevaReunion.unsubscribe();
  }

  updateViewFormAuth(): void {
    this.viewFormAuth.set(!this.viewFormAuth());
  }

  changedViewFormLogin(): void {
    this.viewFormLogin.set(!this.viewFormLogin());
  }

  getStatusAuth(): StatusAuth {
    return this.serviceAuth.getStatusClient();
  }

  isAuthenticado(): boolean {
    return this.serviceAuth.getStatusClient() == StatusAuth.Autenticado;
  }

  procesoLogin(): void {
    const { email, password } = this.myFormLogin.value;
    if (this.myFormLogin.valid) {
      this.serviceAuth.procesoLogin(email, password).subscribe(
        (response: UserAuth) => {
          this.serviceAuth.setUserAuth(response);
          this.serviceAuth.setStatusClient(StatusAuth.Autenticado);
          this.myFormLogin.reset();
          //LOGIC: GUARDAR INFORMACION DEL USER EN EL LOCALSTORAGE
          localStorage.setItem('userAuth', JSON.stringify(response));
        },
        (dataError) => {}
      );
    } else {
    }
  }

  procesoRegistro(): void {
    const { email, password, passwordConfirm } = this.myFormRegister.value;

    if (this.myFormRegister.valid) {
      this.serviceAuth.procesoRegistro(email, password).subscribe(
        (response: UserAuth) => {
          this.serviceAuth.setUserAuth(response);
          this.serviceAuth.setStatusClient(StatusAuth.Autenticado);
          this.myFormRegister.reset();
          //LOGIC: GUARDAR INFORMACION DEL USER EN EL LOCALSTORAGE
          localStorage.setItem('userAuth', JSON.stringify(response));
        },
        (dataError) => {
          console.log(dataError);
        }
      );
    } else {
    }
  }

  cerrarSesion(): void {
    this.serviceAuth.cerrarSesion();
    //LOGIC : ELIMINAR INFORMACION USER DEL LOCALSTORAGE
    localStorage.removeItem('userAuth');
  }

  newReunion(): void {
    if (!this.isAuthenticado()) return;
  }

  unirmReunion(): void {
    if (!this.isAuthenticado()) return;
  }

  emitNuevaReunion(): void {
    const salaNueva = uuidv4().substring(0, 6);
    this.serviceAuth.emitNuevaReunion(
      this.serviceAuth.getUserAuth()!.id,
      salaNueva
    );
  }

  emitUnirseReunion(): void {
    if (this.inputCodigoSala == '') {
      this.messageModalCustom.set('Ingrese un código de sala válido');
      this.modalCustomView.set(true);
      return;
    }

    this.serviceAuth.emitUnirseReunion(
      this.serviceAuth.getUserAuth()!.id,
      this.inputCodigoSala
    );
  }
}
