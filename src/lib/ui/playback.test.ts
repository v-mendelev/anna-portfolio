import { describe, expect, it } from 'vitest';
import { pauseAll, pauseOthers } from './playback';

function fakeMedia(paused: boolean) {
  return {
    paused,
    pauses: 0,
    pause() {
      this.paused = true;
      this.pauses += 1;
    },
  };
}

function rootOf(list: ReturnType<typeof fakeMedia>[]): ParentNode {
  return { querySelectorAll: () => list } as unknown as ParentNode;
}

describe('pauseOthers', () => {
  it('pauses every other playing element and leaves the new one playing', () => {
    const current = fakeMedia(false);
    const other = fakeMedia(false);
    const idle = fakeMedia(true);
    pauseOthers(current as unknown as HTMLMediaElement, rootOf([current, other, idle]));
    expect(current.paused).toBe(false);
    expect(other.paused).toBe(true);
    expect(idle.pauses).toBe(0);
  });
});

describe('pauseAll', () => {
  it('pauses only what is playing', () => {
    const playing = fakeMedia(false);
    const idle = fakeMedia(true);
    pauseAll(rootOf([playing, idle]));
    expect(playing.paused).toBe(true);
    expect(idle.pauses).toBe(0);
  });
});
