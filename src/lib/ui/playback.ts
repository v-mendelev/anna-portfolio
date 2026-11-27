/**
 * One video at a time: when a video starts playing, every other video and
 * audio element on the page pauses. Nothing ever starts playing on its own.
 */
export function pauseOthers(playing: HTMLMediaElement, root: ParentNode): void {
  for (const other of root.querySelectorAll<HTMLMediaElement>('video, audio')) {
    if (other !== playing && !other.paused) other.pause();
  }
}

/** Pauses every playing video or audio element inside `root`. */
export function pauseAll(root: ParentNode): void {
  for (const media of root.querySelectorAll<HTMLMediaElement>('video, audio')) {
    if (!media.paused) media.pause();
  }
}

export function initExclusivePlayback(doc: Document = document): void {
  // `play` does not bubble: listen in the capture phase.
  doc.addEventListener(
    'play',
    (event) => {
      if (event.target instanceof HTMLMediaElement) pauseOthers(event.target, doc);
    },
    true,
  );
}
