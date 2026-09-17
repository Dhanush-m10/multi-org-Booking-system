import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component. Nothing but the outlet — the shell, toasts and dialogs are
 * provided by `AppShellComponent` so public pages (login/register) render
 * without the navigation chrome.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {}
