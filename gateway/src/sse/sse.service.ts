import { Injectable } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';

export interface SseEvent {
  type: string;
  folder?: string;
  count?: number;
  seq?: number;
  flags?: string[];
  [k: string]: unknown;
}

interface Envelope {
  sessionId: string;
  event: SseEvent;
}

@Injectable()
export class SseService {
  private readonly bus = new Subject<Envelope>();

  publish(sessionId: string, event: SseEvent): void {
    this.bus.next({ sessionId, event });
  }

  stream(sessionId: string): Observable<{ data: SseEvent }> {
    return this.bus.asObservable().pipe(
      filter((e) => e.sessionId === sessionId),
      map((e) => ({ data: e.event })),
    );
  }
}
