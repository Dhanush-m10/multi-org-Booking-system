import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { ModalComponent } from './modal.component';

/**
 * Host component that mirrors how the app opens dialogs: a trigger button in
 * the page, and the dialog rendered conditionally from a signal.
 */
@Component({
  imports: [ModalComponent],
  template: `
    <button id="trigger" type="button" (click)="open.set(true)">Open</button>
    @if (open()) {
      <app-modal title="Test dialog" [open]="open()" (closed)="open.set(false)">
        <button id="first" type="button">First</button>
        <button id="last" type="button">Last</button>
      </app-modal>
    }
  `,
})
class HostComponent {
  readonly open = signal(false);
}

/** Dispatch a real Tab keypress the way the browser would. */
function pressTab(fixture: ComponentFixture<HostComponent>, shift = false): boolean {
  const target = document.activeElement ?? document.body;
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  fixture.detectChanges();
  return event.defaultPrevented;
}

describe('ModalComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  /** The trigger button, typed. */
  const trigger = (): HTMLButtonElement => host.querySelector<HTMLButtonElement>('#trigger')!;

  it('moves focus into the dialog when it opens', async () => {
    trigger().click();
    fixture.detectChanges();
    // The panel is focused via queueMicrotask, so let the microtask queue drain.
    await Promise.resolve();
    fixture.detectChanges();

    const panel = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(panel);
  });

  // Note on DOM order: the dialog's own close button lives in the header, so it
  // is the FIRST focusable element — before any projected content.

  it('wraps Tab forwards from the last control back to the close button', async () => {
    trigger().click();
    fixture.detectChanges();
    await Promise.resolve();

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!;
    const last = document.querySelector<HTMLButtonElement>('#last')!;
    last.focus();
    expect(document.activeElement).toBe(last);

    expect(pressTab(fixture)).toBe(true); // the trap intervened
    expect(document.activeElement).toBe(closeButton);
  });

  it('wraps Shift+Tab backwards from the close button to the last control', async () => {
    trigger().click();
    fixture.detectChanges();
    await Promise.resolve();

    const closeButton = document.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!;
    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);

    expect(pressTab(fixture, true)).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('#last'));
  });

  it('leaves Tab alone when focus is not at either end', async () => {
    trigger().click();
    fixture.detectChanges();
    await Promise.resolve();

    // `#first` is a middle element (the close button precedes it), so the
    // browser should handle this Tab itself.
    document.querySelector<HTMLButtonElement>('#first')!.focus();
    expect(pressTab(fixture)).toBe(false);
  });

  it('returns focus to the trigger when the dialog closes', async () => {
    const opener = trigger();
    // jsdom's programmatic `.click()` does not move focus the way a real click
    // does, so focus the trigger explicitly before opening.
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement).not.toBe(opener);

    // Escape closes the dialog.
    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('#first')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('locks body scroll while open and releases it on close', () => {
    trigger().click();
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');

    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('');
  });
});
