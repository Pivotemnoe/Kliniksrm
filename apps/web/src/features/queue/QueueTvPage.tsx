import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AnimalSpeciesIcon } from '../../shared/ui/AnimalSpeciesIcon';
import { getQueueScreen } from './queue.api';
import { QueueScreenItem } from './types';

export function QueueTvPage() {
  const playedCallsRef = useRef<Map<string, string>>(new Map());
  const callsObservedRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(() => window.localStorage.getItem('queue-tv-sound-enabled') === 'true');
  const [soundBlocked, setSoundBlocked] = useState(false);
  const queueScreenQuery = useQuery({
    queryKey: ['queue-tv'],
    queryFn: getQueueScreen,
    refetchInterval: 2000,
  });
  const calledItems = queueScreenQuery.data?.called ?? [];

  useEffect(() => {
    const currentIds = new Set(calledItems.map((item) => item.id));

    for (const id of playedCallsRef.current.keys()) {
      if (!currentIds.has(id)) {
        playedCallsRef.current.delete(id);
      }
    }

    const hasNewCall = calledItems.some((item) => {
      const callKey = getQueueCallKey(item);
      const previousCallKey = playedCallsRef.current.get(item.id);
      playedCallsRef.current.set(item.id, callKey);

      return callsObservedRef.current && (previousCallKey === undefined || previousCallKey !== callKey);
    });
    callsObservedRef.current = true;

    if (!hasNewCall) {
      return;
    }

    if (!soundEnabled) {
      setSoundBlocked(true);
      return;
    }

    playQueueCallSound()
      .then(() => setSoundBlocked(false))
      .catch(() => {
        setSoundEnabled(false);
        setSoundBlocked(true);
      });
  }, [calledItems, soundEnabled]);

  async function enableSound() {
    try {
      await playQueueCallSound();
      window.localStorage.setItem('queue-tv-sound-enabled', 'true');
      setSoundEnabled(true);
      setSoundBlocked(false);
    } catch {
      window.localStorage.removeItem('queue-tv-sound-enabled');
      setSoundEnabled(false);
      setSoundBlocked(true);
    }
  }

  return (
    <main
      className="queue-tv-screen"
      onClick={() => void enableSound()}
    >
      <section className="queue-tv-column">
        <h1 className="queue-tv-title">Ожидайте</h1>
        <QueueTvList items={queueScreenQuery.data?.waiting ?? []} />
      </section>
      <section className="queue-tv-column">
        <h1 className="queue-tv-title">Вызов в кабинет</h1>
        <QueueTvList items={queueScreenQuery.data?.called ?? []} called />
      </section>
    </main>
  );
}

function QueueTvList({ items, called }: { items: QueueScreenItem[]; called?: boolean }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="queue-tv-list">
      {items.map((item) => (
        <article className={['queue-tv-item', called ? 'queue-tv-item-called' : ''].filter(Boolean).join(' ')} key={item.id}>
          <div className="queue-tv-name">
            <AnimalSpeciesIcon species={item.animalSpecies} size={42} showTooltip={false} />
            <strong>{getPublicQueueName(item)}</strong>
          </div>
          {called && item.roomName ? <span>{item.roomName}</span> : null}
        </article>
      ))}
    </div>
  );
}

function getPublicQueueName(item: QueueScreenItem) {
  return `${item.clientSurname} · ${item.animalName}`;
}

function getQueueCallKey(item: QueueScreenItem) {
  return [item.lastCalledAt ?? item.startedAt ?? item.createdAt, item.callCount].join(':');
}

async function playQueueCallSound() {
  const AudioContextConstructor =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return;
  }

  const context = new AudioContextConstructor();
  await context.resume();

  const baseTime = context.currentTime;
  const masterGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  masterGain.gain.setValueAtTime(0.78, baseTime);
  masterGain.connect(compressor);
  compressor.connect(context.destination);

  [0, 0.22, 0.44, 0.84, 1.06, 1.28].forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const overtone = context.createOscillator();
    const gain = context.createGain();
    const startAt = baseTime + offset;
    const endAt = startAt + 0.18;
    const frequency = index % 3 === 1 ? 1320 : index % 3 === 2 ? 1040 : 880;

    oscillator.type = 'square';
    overtone.type = 'triangle';
    oscillator.frequency.value = frequency;
    overtone.frequency.value = frequency * 1.5;
    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.38, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, endAt);
    oscillator.connect(gain);
    overtone.connect(gain);
    gain.connect(masterGain);
    oscillator.start(startAt);
    overtone.start(startAt);
    oscillator.stop(endAt + 0.02);
    overtone.stop(endAt + 0.02);
  });

  window.setTimeout(() => void context.close(), 1700);
}
