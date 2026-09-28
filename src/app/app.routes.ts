import { Routes } from '@angular/router';
import { ChatPageComponent } from './features/chat/chat-page/chat-page.component';
import { NewChatComponent } from './features/chat/new-chat.component';

export const routes: Routes = [
  { path: '', component: NewChatComponent },
  { path: 'chat/:id', component: ChatPageComponent },
  {
    path: 'projects',
    title: 'nav.projects',
    loadComponent: () => import('./features/projects/projects-page.component').then((m) => m.ProjectsPageComponent),
  },
  {
    path: 'projects/:id',
    title: 'project.label',
    loadComponent: () =>
      import('./features/projects/project-detail-page.component').then((m) => m.ProjectDetailPageComponent),
  },
  {
    path: 'settings',
    title: 'settings.title',
    loadComponent: () => import('./features/settings/settings-layout.component').then((m) => m.SettingsLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'general' },
      {
        path: 'general',
        loadComponent: () =>
          import('./features/settings/sections/general-settings.component').then((m) => m.GeneralSettingsComponent),
      },
      {
        path: 'models',
        loadComponent: () =>
          import('./features/settings/sections/model-settings.component').then((m) => m.ModelSettingsComponent),
      },
      {
        path: 'themes',
        loadComponent: () =>
          import('./features/settings/sections/theme-settings.component').then((m) => m.ThemeSettingsComponent),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./features/settings/sections/chat-settings.component').then((m) => m.ChatSettingsComponent),
      },
      {
        path: 'files',
        loadComponent: () =>
          import('./features/settings/sections/file-settings.component').then((m) => m.FileSettingsComponent),
      },
      {
        path: 'data',
        loadComponent: () =>
          import('./features/settings/sections/data-settings.component').then((m) => m.DataSettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
