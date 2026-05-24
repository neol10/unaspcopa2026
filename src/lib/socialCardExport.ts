import { toPng } from 'html-to-image';

export type SocialCardTheme = 'gold' | 'blue' | 'red' | 'green';

interface SocialCardPlayer {
  name: string;
  teamName?: string;
  position?: string;
  photoUrl?: string;
  teamBadgeUrl?: string;
  teamPrimaryColor?: string | null;
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
  valueEl.style.fontSize = '42px';
  valueEl.style.lineHeight = '1';
  valueEl.style.color = '#ffffff';
  valueEl.style.textShadow = `0 0 15px ${primary}`;
  valueEl.style.fontWeight = '900';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.fontSize = '18px';
  labelEl.style.color = primary;
  labelEl.style.fontWeight = '800';
  labelEl.style.textTransform = 'uppercase';
  labelEl.style.letterSpacing = '0.12em';

  tile.append(valueEl, labelEl);
  return tile;
};

const getDominantColor = (imgUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; 
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('14,165,233'); // fallback blue
      ctx.drawImage(img, 0, 0, 64, 64);
      try {
        const data = ctx.getImageData(0, 0, 64, 64).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i+3];
          if (a > 200) {
             const max = Math.max(data[i], data[i+1], data[i+2]);
             const min = Math.min(data[i], data[i+1], data[i+2]);
             const isGray = (max - min) < 20 && max > 30 && max < 220;
             if (!isGray && (data[i] < 240 || data[i+1] < 240 || data[i+2] < 240)) {
               r += data[i];
               g += data[i+1];
               b += data[i+2];
               count++;
             }
          }
        }
        if (count === 0) return resolve('14,165,233');
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        
        // Boost vibrance slightly
        const maxFinal = Math.max(r, g, b);
        if (maxFinal > 0 && maxFinal < 180) {
           const multiplier = 180 / maxFinal;
           r = Math.min(255, Math.floor(r * multiplier));
           g = Math.min(255, Math.floor(g * multiplier));
           b = Math.min(255, Math.floor(b * multiplier));
        }

        resolve(`${r}, ${g}, ${b}`); 
      } catch {
        resolve('14,165,233'); 
      }
    };
    img.onerror = () => resolve('14,165,233');
    img.src = imgUrl;
  });
};

const hexToRgbStr = (hex: string): string => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return `${r}, ${g}, ${b}`;
};

export const downloadSocialPlayerCard = async ({
  fileName,
  category,
  subtitle,
  player,
  stats,
  theme = 'gold',
}: DownloadSocialCardOptions) => {
  let colors = THEME_COLORS[theme];
  let teamAccentRgb: string | null = null;

  if (player.teamPrimaryColor && /^#[0-9A-F]{3,6}$/i.test(player.teamPrimaryColor)) {
    const rgbStr = hexToRgbStr(player.teamPrimaryColor);
    teamAccentRgb = rgbStr;
    colors = {
      primary: `rgb(${rgbStr})`,
      secondary: `rgb(${rgbStr})`,
      glow: `rgba(${rgbStr}, 0.25)`,
    };
  } else if (player.teamBadgeUrl) {
    const rgbStr = await getDominantColor(player.teamBadgeUrl);
    teamAccentRgb = rgbStr;
    colors = {
      primary: `rgb(${rgbStr})`,
      secondary: `rgb(${rgbStr})`,
      glow: `rgba(${rgbStr}, 0.25)`,
    };
  }

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
  card.style.background = teamAccentRgb
    ? `radial-gradient(circle at 85% 15%, rgba(${teamAccentRgb}, 0.5), transparent 50%), radial-gradient(circle at 15% 85%, rgba(${teamAccentRgb}, 0.2), transparent 50%), linear-gradient(135deg, #0b1220 0%, #151e32 100%)`
    : `radial-gradient(circle at 85% 15%, ${colors.glow}, transparent 50%), linear-gradient(135deg, #0b1220 0%, #151e32 100%)`;
  card.style.border = `2px solid rgba(255,255,255,0.1)`;
  card.style.boxShadow = `inset 0 0 100px rgba(0,0,0,0.8), 0 0 40px ${colors.glow}`;
  card.style.position = 'relative';

  // Textura overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.opacity = '0.03';
  overlay.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")';
  overlay.style.zIndex = '0';
  card.appendChild(overlay);

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
  categoryEl.style.fontSize = '84px';
  categoryEl.style.lineHeight = '1';
  categoryEl.style.letterSpacing = '-0.03em';
  categoryEl.style.fontWeight = '900';
  categoryEl.style.background = `linear-gradient(to right, #ffffff, ${colors.secondary})`;
  categoryEl.style.webkitBackgroundClip = 'text';
  categoryEl.style.webkitTextFillColor = 'transparent';

  const subtitleEl = document.createElement('p');
  subtitleEl.textContent = subtitle || 'Card oficial para compartilhamento';
  subtitleEl.style.margin = '0';
  subtitleEl.style.fontSize = '24px';
  subtitleEl.style.color = 'rgba(255,255,255,0.78)';
  subtitleEl.style.fontWeight = '500';

  labelWrap.append(tourney, categoryEl, subtitleEl);

  const badgeWrap = document.createElement('div');
  badgeWrap.style.width = '140px';
  badgeWrap.style.height = '140px';
  badgeWrap.style.borderRadius = '50%';
  badgeWrap.style.border = `2px solid ${colors.secondary}`;
  badgeWrap.style.boxShadow = `0 0 30px ${colors.glow}`;
  badgeWrap.style.background = 'rgba(0,0,0,0.4)';
  badgeWrap.style.display = 'flex';
  badgeWrap.style.alignItems = 'center';
  badgeWrap.style.justifyContent = 'center';

  if (player.teamBadgeUrl) {
    const badgeImg = document.createElement('img');
    badgeImg.crossOrigin = 'anonymous';
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
  avatarWrap.style.width = '350px';
  avatarWrap.style.height = '350px';
  avatarWrap.style.borderRadius = '24px';
  avatarWrap.style.overflow = 'hidden';
  avatarWrap.style.border = `2px solid ${colors.secondary}`;
  avatarWrap.style.background = `linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.01))`;
  avatarWrap.style.boxShadow = `0 0 50px ${colors.glow}`;
  avatarWrap.style.display = 'flex';
  avatarWrap.style.alignItems = 'center';
  avatarWrap.style.justifyContent = 'center';
  avatarWrap.style.position = 'relative';
  
  const innerGlow = document.createElement('div');
  innerGlow.style.position = 'absolute';
  innerGlow.style.inset = '0';
  innerGlow.style.background = `radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.4) 100%)`;
  innerGlow.style.zIndex = '1';
  avatarWrap.appendChild(innerGlow);

  if (player.photoUrl) {
    const photo = document.createElement('img');
    photo.crossOrigin = 'anonymous';
    photo.src = player.photoUrl;
    photo.alt = player.name;
    photo.width = 350;
    photo.height = 350;
    photo.style.objectFit = 'cover';
    photo.style.position = 'relative';
    photo.style.zIndex = '2';
    photo.style.filter = 'drop-shadow(0px 10px 20px rgba(0,0,0,0.5))';
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
  nameEl.style.fontSize = '72px';
  nameEl.style.lineHeight = '0.9';
  nameEl.style.letterSpacing = '-0.02em';
  nameEl.style.textShadow = '0 10px 20px rgba(0,0,0,0.5)';

  const teamEl = document.createElement('p');
  teamEl.textContent = player.teamName || 'Equipe da Copa Unasp';
  teamEl.style.margin = '0';
  teamEl.style.fontSize = '34px';
  teamEl.style.fontWeight = '700';
  teamEl.style.color = colors.secondary;
  teamEl.style.textShadow = `0 0 20px ${colors.glow}`;

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
  footerLeft.textContent = 'unaspcopa2026.vercel.app';
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
  body.style.gap = '50px';
  body.style.position = 'relative';
  body.style.zIndex = '10';
  body.append(middle, statsWrap);

  card.append(topRow, body, footer);
  
  // Garantir que todos os elementos respeitam o z-index para ficar acima do overlay
  topRow.style.position = 'relative';
  topRow.style.zIndex = '10';
  footer.style.position = 'relative';
  footer.style.zIndex = '10';
  
  mount.append(card);
  document.body.appendChild(mount);

  try {
    await document.fonts.ready;
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
