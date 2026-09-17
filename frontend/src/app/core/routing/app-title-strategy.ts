import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * Sets the browser tab title from each route's `data.title`.
 *
 * Using `data.title` (instead of the router's built-in `title` property) keeps
 * one source of truth that the top bar also reads.
 */
@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  constructor(private readonly titleRef: Title) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    this.titleRef.setTitle(title ? `${title} · BookingDesk` : 'BookingDesk');
  }

  override buildTitle(snapshot: RouterStateSnapshot): string | undefined {
    let route: ActivatedRouteSnapshot | undefined = snapshot.root;
    let title: string | undefined;

    while (route) {
      const candidate = route.data['title'];
      if (typeof candidate === 'string' && candidate.length > 0) {
        title = candidate;
      }
      route = route.children[0];
    }

    return title;
  }
}
