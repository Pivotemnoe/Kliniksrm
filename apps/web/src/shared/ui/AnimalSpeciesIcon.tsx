import { Tooltip } from 'antd';
import type { CSSProperties } from 'react';

type AnimalIconKind = 'cat' | 'dog' | 'bird' | 'reptile' | 'horse' | 'other';

type AnimalSpeciesIconProps = {
  species?: string | null;
  size?: number;
  showTooltip?: boolean;
  className?: string;
};

type AnimalSpeciesLabelProps = AnimalSpeciesIconProps & {
  fallback?: string;
};

export function AnimalSpeciesIcon({ species, size = 18, showTooltip = true, className }: AnimalSpeciesIconProps) {
  const kind = getAnimalIconKind(species);
  const label = getAnimalIconLabel(kind, species);
  const icon = (
    <span
      role="img"
      aria-label={label}
      className={['animal-species-icon', `animal-species-icon-${kind}`, className].filter(Boolean).join(' ')}
      style={{ '--animal-icon-size': `${size}px` } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {renderAnimalIcon(kind)}
      </svg>
    </span>
  );

  return showTooltip ? <Tooltip title={label}>{icon}</Tooltip> : icon;
}

export function AnimalSpeciesLabel({ species, fallback = '—', size, showTooltip, className }: AnimalSpeciesLabelProps) {
  return (
    <span className={['animal-species-label', className].filter(Boolean).join(' ')}>
      <AnimalSpeciesIcon species={species} size={size} showTooltip={showTooltip} />
      <span>{species || fallback}</span>
    </span>
  );
}

function getAnimalIconKind(species?: string | null): AnimalIconKind {
  const value = species?.trim().toLowerCase() ?? '';

  if (/(кошка|кот|кошач|cat)/.test(value)) {
    return 'cat';
  }

  if (/(собака|пес|пёс|собач|dog)/.test(value)) {
    return 'dog';
  }

  if (/(птица|попугай|канарей|bird|parrot)/.test(value)) {
    return 'bird';
  }

  if (/(рептилия|черепаха|ящер|змея|turtle|reptile|snake|lizard)/.test(value)) {
    return 'reptile';
  }

  if (/(лошадь|конь|horse)/.test(value)) {
    return 'horse';
  }

  return 'other';
}

function getAnimalIconLabel(kind: AnimalIconKind, species?: string | null) {
  if (species?.trim()) {
    return species;
  }

  const labels: Record<AnimalIconKind, string> = {
    cat: 'Кошка',
    dog: 'Собака',
    bird: 'Птица',
    reptile: 'Рептилия',
    horse: 'Лошадь',
    other: 'Вид животного',
  };

  return labels[kind];
}

function renderAnimalIcon(kind: AnimalIconKind) {
  switch (kind) {
    case 'cat':
      return (
        <>
          <path d="M5 9 4 4l5 3h6l5-3-1 5" />
          <path d="M5 9c-1.4 1.3-2 3-2 5 0 4 3.6 7 9 7s9-3 9-7c0-2-.6-3.7-2-5" />
          <path d="M8.5 14h.01M15.5 14h.01M10 17c1.2.8 2.8.8 4 0" />
        </>
      );
    case 'dog':
      return (
        <>
          <path d="M7 8c1.1-2.3 3-4 5-4s3.9 1.7 5 4" />
          <path d="M6 8 3 6v5c0 1.7 1.1 3 2.6 3" />
          <path d="M18 8l3-2v5c0 1.7-1.1 3-2.6 3" />
          <path d="M6 13c0 4 2.8 7 6 7s6-3 6-7" />
          <path d="M9 12h.01M15 12h.01M10.5 16h3" />
        </>
      );
    case 'bird':
      return (
        <>
          <path d="M5 13c2.5-5 7.6-7.1 13-5" />
          <path d="M7 14c2.4 3.2 6.3 4.2 10 2" />
          <path d="M17 8l4-2-2 4" />
          <path d="M10 16l-2 4M13 17l1 3" />
          <path d="M14.5 10.5h.01" />
        </>
      );
    case 'reptile':
      return (
        <>
          <path d="M6 13c0-3 2.7-5 6-5s6 2 6 5-2.7 5-6 5-6-2-6-5Z" />
          <path d="M3 12h3M18 12h3M7 9 5 7M17 9l2-2M7 16l-2 2M17 16l2 2" />
          <path d="M10 12h4M11 15h2" />
        </>
      );
    case 'horse':
      return (
        <>
          <path d="M7 20V9l3-5h6l3 4-2 3h-3l-2 3v6" />
          <path d="M10 4v5M14 4v4M7 12H4M12 20h5" />
          <path d="M15.5 8.5h.01" />
        </>
      );
    default:
      return (
        <>
          <path d="M12 14c2.2 0 4 1.5 4 3.4 0 1.5-1.1 2.6-2.7 2.6h-2.6C9.1 20 8 18.9 8 17.4 8 15.5 9.8 14 12 14Z" />
          <path d="M7.5 11.5c1 0 1.8-.9 1.8-2s-.8-2-1.8-2-1.8.9-1.8 2 .8 2 1.8 2ZM14.7 9.5c0 1.1.8 2 1.8 2s1.8-.9 1.8-2-.8-2-1.8-2-1.8.9-1.8 2ZM10.5 7.5c1 0 1.8-.9 1.8-2s-.8-2-1.8-2-1.8.9-1.8 2 .8 2 1.8 2ZM13.7 5.5c0 1.1.8 2 1.8 2s1.8-.9 1.8-2-.8-2-1.8-2-1.8.9-1.8 2Z" />
        </>
      );
  }
}
