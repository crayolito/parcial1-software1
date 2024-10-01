import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.component').then((m) => m.default),
  },
  {
    path: 'uml/:id',
    loadComponent: () =>
      import('./diagramador/diagramador.component').then((m) => m.default),
  },
  {
    path: '',
    redirectTo: '/home',
    pathMatch: 'full',
  },
];
