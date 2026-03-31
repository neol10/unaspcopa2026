import { toPng } from 'html-to-image';

export type SocialCardTheme = 'gold' | 'blue' | 'red' | 'green';

interface SocialCardPlayer {
  name: string;
  teamName?: string;
  position?: string;
  photoUrl?: string;
  teamBadgeUrl?: string;
}

interface SocialCardStat {
  label: string;
  value: string | number;
}

interface DownloadSocialCardOptions {
  fileName: string;
  category: string;
  subtitle?: string;
  player: SocialCardPlayer;
  stats: SocialCardStat[];
  theme?: SocialCardTheme;
}

const THEME_COLORS: Record<SocialCardTheme, { primary: string; secondary: string; glow: string }> = {
  gold: { primary: '#f59e0b', secondary: '#facc15', glow: 'rgba(245, 158, 11, 0.25)' },
  blue: { primary: '#0ea5e9', secondary: '#22d3ee', glow: 'rgba(14, 165, 233, 0.25)' },
  red: { primary: '#ef4444', secondary: '#fb7185', glow: 'rgba(239, 68, 68, 0.25)' },
  green: { primary: '#10b981', secondary: '#34d399', glow: 'rgba(16, 185, 129, 0.25)' },
};

const waitForImages = async (root: HTMLElement) => {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
};

const createStatTile = (label: string, value: string | number, primary: string) => {
  const tile = document.createElement('div');
  tile.style.flex = '1';
  tile.style.minWidth = '0';
  tile.style.padding = '18px 16px';
  tile.style.borderRadius = '16px';
  tile.style.background = 'rgba(255,255,255,0.06)';
  tile.style.border = '1px solid rgba(255,255,255,0.15)';
  tile.style.display = 'flex';
  tile.style.flexDirection = 'column';
  tile.style.gap = '6px';

  const valueEl = document.createElement('strong');
  valueEl.textContent = String(value);
  valueEl.style.fontSize = '34px';
  valueEl.style.lineHeight = '1';
  valueEl.style.color = primary;
  valueEl.style.fontWeight = '900';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.fontSize = '18px';
  labelEl.style.color = 'rgba(255,255,255,0.82)';
  labelEl.style.fontWeight = '700';
  labelEl.style.textTransform = 'uppercase';
  labelEl.style.letterSpacing = '0.08em';

  tile.append(valueEl, labelEl);
  return tile;
};

export const downloadSocialPlayerCard = async ({
  fileName,
  category,
  subtitle,
  player,
  stats,
  theme = 'gold',
}: DownloadSocialCardOptions) => {
  const colors = THEME_COLORS[theme];

  const mount = document.createElement('div');
  mount.style.position = 'fixed';
  mount.style.left = '-99999px';
  mount.style.top = '0';
  mount.style.zIndex = '-1';
  mount.style.pointerEvents = 'none';

  const card = document.createElement('div');
  card.style.width = '1080px';
  card.style.height = '1350px';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.justifyContent = 'space-between';
  card.style.padding = '56px';
  card.style.boxSizing = 'border-box';
  card.style.borderRadius = '36px';
  card.style.overflow = 'hidden';
  card.style.color = '#ffffff';
  card.style.fontFamily = "'Poppins', 'Segoe UI', sans-serif";
  card.style.background =
    `radial-gradient(circle at 85% 15%, ${colors.glow}, transparent 45%), ` +
    `linear-gradient(160deg, #0b1220 0%, #121c2f 45%, #111827 100%)`;
  card.style.border = `2px solid ${colors.glow}`;
  card.style.position = 'relative';

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.justifyContent = 'space-between';
  topRow.style.alignItems = 'flex-start';

  const labelWrap = document.createElement('div');
  labelWrap.style.display = 'flex';
  labelWrap.style.flexDirection = 'column';
  labelWrap.style.gap = '12px';

  const tourney = document.createElement('span');
  tourney.textContent = 'COPA UNASP 2026';
  tourney.style.fontSize = '28px';
  tourney.style.letterSpacing = '0.12em';
  tourney.style.fontWeight = '800';
  tourney.style.color = 'rgba(255,255,255,0.7)';

  const categoryEl = document.createElement('h1');
  categoryEl.textContent = category;
  categoryEl.style.margin = '0';
  categoryEl.style.fontSize = '74px';
  categoryEl.style.lineHeight = '0.95';
  categoryEl.style.letterSpacing = '-0.02em';
  categoryEl.style.fontWeight = '900';

  const subtitleEl = document.createElement('p');
  subtitleEl.textContent = subtitle || 'Card oficial para compartilhamento';
  subtitleEl.style.margin = '0';
  subtitleEl.style.fontSize = '24px';
  subtitleEl.style.color = 'rgba(255,255,255,0.78)';
  subtitleEl.style.fontWeight = '500';

  labelWrap.append(tourney, categoryEl, subtitleEl);

  const badgeWrap = document.createElement('div');
  badgeWrap.style.width = '124px';
  badgeWrap.style.height = '124px';
  badgeWrap.style.borderRadius = '26px';
  badgeWrap.style.border = '1px solid rgba(255,255,255,0.2)';
  badgeWrap.style.background = 'rgba(255,255,255,0.06)';
  badgeWrap.style.display = 'flex';
  badgeWrap.style.alignItems = 'center';
  badgeWrap.style.justifyContent = 'center';

  if (player.teamBadgeUrl) {
    const badgeImg = document.createElement('img');
    badgeImg.src = player.teamBadgeUrl;
    badgeImg.alt = player.teamName || 'Time';
    badgeImg.width = 90;
    badgeImg.height = 90;
    badgeImg.style.objectFit = 'contain';
    badgeWrap.appendChild(badgeImg);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = 'TIME';
    fallback.style.fontSize = '20px';
    fallback.style.fontWeight = '800';
    fallback.style.color = 'rgba(255,255,255,0.7)';
    badgeWrap.appendChild(fallback);
  }

  topRow.append(labelWrap, badgeWrap);

  const middle = document.createElement('div');
  middle.style.display = 'flex';
  middle.style.gap = '34px';
  middle.style.alignItems = 'center';

  const avatarWrap = document.createElement('div');
  avatarWrap.style.width = '310px';
  avatarWrap.style.height = '310px';
  avatarWrap.style.borderRadius = '32px';
  avatarWrap.style.overflow = 'hidden';
  avatarWrap.style.border = `2px solid ${colors.glow}`;
  avatarWrap.style.background = 'rgba(255,255,255,0.04)';
  avatarWrap.style.display = 'flex';
  avatarWrap.style.alignItems = 'center';
  avatarWrap.style.justifyContent = 'center';

  if (player.photoUrl) {
    const photo = document.createElement('img');
    photo.src = player.photoUrl;
    photo.alt = player.name;
    photo.width = 310;
    photo.height = 310;
    photo.style.objectFit = 'cover';
    avatarWrap.appendChild(photo);
  } else {
    const noPhoto = document.createElement('span');
    noPhoto.textContent = player.name.charAt(0).toUpperCase();
    noPhoto.style.fontSize = '120px';
    noPhoto.style.fontWeight = '900';
    noPhoto.style.color = 'rgba(255,255,255,0.55)';
    avatarWrap.appendChild(noPhoto);
  }

  const playerInfo = document.createElement('div');
  playerInfo.style.display = 'flex';
  playerInfo.style.flexDirection = 'column';
  playerInfo.style.gap = '14px';

  const nameEl = document.createElement('h2');
  nameEl.textContent = player.name;
  nameEl.style.margin = '0';
  nameEl.style.fontSize = '64px';
  nameEl.style.lineHeight = '0.98';
  nameEl.style.letterSpacing = '-0.02em';

  const teamEl = document.createElement('p');
  teamEl.textContent = player.teamName || 'Equipe da Copa Unasp';
  teamEl.style.margin = '0';
  teamEl.style.fontSize = '31px';
  teamEl.style.fontWeight = '600';
  teamEl.style.color = colors.secondary;

  const positionChip = document.createElement('span');
  positionChip.textContent = player.position || 'Atleta';
  positionChip.style.display = 'inline-flex';
  positionChip.style.width = 'fit-content';
  positionChip.style.padding = '10px 16px';
  positionChip.style.borderRadius = '999px';
  positionChip.style.fontSize = '18px';
  positionChip.style.fontWeight = '800';
  positionChip.style.textTransform = 'uppercase';
  positionChip.style.letterSpacing = '0.08em';
  positionChip.style.background = 'rgba(255,255,255,0.09)';
  positionChip.style.border = '1px solid rgba(255,255,255,0.16)';

  playerInfo.append(nameEl, teamEl, positionChip);
  middle.append(avatarWrap, playerInfo);

  const statsWrap = document.createElement('div');
  statsWrap.style.display = 'flex';
  statsWrap.style.gap = '14px';
  statsWrap.style.marginTop = '12px';

  const limitedStats = stats.slice(0, 3);
  limitedStats.forEach((stat) => {
    statsWrap.appendChild(createStatTile(stat.label, stat.value, colors.secondary));
  });

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.paddingTop = '20px';
  footer.style.borderTop = '1px solid rgba(255,255,255,0.16)';

  const footerLeft = document.createElement('span');
  footerLeft.textContent = 'www.copaunasp.com.br';
  footerLeft.style.fontSize = '22px';
  footerLeft.style.color = 'rgba(255,255,255,0.75)';
  footerLeft.style.fontWeight = '600';

  const footerRight = document.createElement('span');
  footerRight.textContent = '@copaunasp';
  footerRight.style.fontSize = '22px';
  footerRight.style.color = colors.secondary;
  footerRight.style.fontWeight = '700';

  footer.append(footerLeft, footerRight);

  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '38px';
  body.append(middle, statsWrap);

  card.append(topRow, body, footer);
  mount.append(card);
  document.body.appendChild(mount);

  try {
    await waitForImages(card);
    const dataUrl = await toPng(card, {
      quality: 1,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#0b1220',
    });

    const link = document.createElement('a');
    link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    mount.remove();
  }
};
