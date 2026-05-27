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

interface SocialCardTeam {
  name: string;
  group?: string;
  leader?: string;
  badgeUrl?: string;
  primaryColor?: string | null;
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

interface DownloadSocialTeamCardOptions {
  fileName: string;
  category: string;
  subtitle?: string;
  team: SocialCardTeam;
}

interface SocialCardStandingRow {
  rank: number;
  teamName: string;
  badgeUrl?: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  percentage: number;
}

interface DownloadSocialGroupStandingCardOptions {
  fileName: string;
  groupName: string;
  subtitle?: string;
  rows: SocialCardStandingRow[];
}

interface SocialCardStandingGroup {
  groupName: string;
  rows: SocialCardStandingRow[];
}

interface DownloadSocialStandingsCardOptions {
  fileName: string;
  title?: string;
  subtitle?: string;
  groups: SocialCardStandingGroup[];
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
    const fallback = document.createElement('div');
    fallback.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(255,255,255,0.5)"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
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

export const downloadSocialTeamCard = async ({
  fileName,
  category,
  subtitle,
  team,
}: DownloadSocialTeamCardOptions) => {
  const baseTheme: SocialCardTheme = 'blue';
  let colors = THEME_COLORS[baseTheme];
  let teamAccentRgb: string | null = null;

  if (team.primaryColor && /^#[0-9A-F]{3,6}$/i.test(team.primaryColor)) {
    const rgbStr = hexToRgbStr(team.primaryColor);
    teamAccentRgb = rgbStr;
    colors = {
      primary: `rgb(${rgbStr})`,
      secondary: `rgb(${rgbStr})`,
      glow: `rgba(${rgbStr}, 0.25)`,
    };
  } else if (team.badgeUrl) {
    const rgbStr = await getDominantColor(team.badgeUrl);
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
  card.style.border = '2px solid rgba(255,255,255,0.1)';
  card.style.boxShadow = `inset 0 0 100px rgba(0,0,0,0.8), 0 0 40px ${colors.glow}`;
  card.style.position = 'relative';

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
  topRow.style.position = 'relative';
  topRow.style.zIndex = '10';

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
  subtitleEl.textContent = subtitle || 'Card oficial da seleção';
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

  if (team.badgeUrl) {
    const badgeImg = document.createElement('img');
    badgeImg.crossOrigin = 'anonymous';
    badgeImg.src = team.badgeUrl;
    badgeImg.alt = team.name;
    badgeImg.width = 90;
    badgeImg.height = 90;
    badgeImg.style.objectFit = 'contain';
    badgeWrap.appendChild(badgeImg);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = team.name.charAt(0).toUpperCase();
    fallback.style.fontSize = '44px';
    fallback.style.fontWeight = '900';
    fallback.style.color = 'rgba(255,255,255,0.75)';
    badgeWrap.appendChild(fallback);
  }

  topRow.append(labelWrap, badgeWrap);

  const middle = document.createElement('div');
  middle.style.display = 'flex';
  middle.style.flexDirection = 'column';
  middle.style.gap = '28px';
  middle.style.flex = '1';
  middle.style.justifyContent = 'center';

  const heroCard = document.createElement('div');
  heroCard.style.padding = '38px';
  heroCard.style.borderRadius = '32px';
  heroCard.style.background = 'rgba(255,255,255,0.06)';
  heroCard.style.border = '1px solid rgba(255,255,255,0.14)';
  heroCard.style.boxShadow = `0 0 50px ${colors.glow}`;
  heroCard.style.display = 'flex';
  heroCard.style.alignItems = 'center';
  heroCard.style.gap = '30px';

  const emblem = document.createElement('div');
  emblem.style.width = '240px';
  emblem.style.height = '240px';
  emblem.style.borderRadius = '50%';
  emblem.style.border = `2px solid ${colors.secondary}`;
  emblem.style.background = 'rgba(0,0,0,0.28)';
  emblem.style.display = 'flex';
  emblem.style.alignItems = 'center';
  emblem.style.justifyContent = 'center';
  emblem.style.flexShrink = '0';

  if (team.badgeUrl) {
    const emblemImg = document.createElement('img');
    emblemImg.crossOrigin = 'anonymous';
    emblemImg.src = team.badgeUrl;
    emblemImg.alt = team.name;
    emblemImg.width = 180;
    emblemImg.height = 180;
    emblemImg.style.objectFit = 'contain';
    emblemImg.style.filter = 'drop-shadow(0 10px 20px rgba(0,0,0,0.35))';
    emblem.appendChild(emblemImg);
  } else {
    const emblemText = document.createElement('span');
    emblemText.textContent = team.name.charAt(0).toUpperCase();
    emblemText.style.fontSize = '84px';
    emblemText.style.fontWeight = '900';
    emblemText.style.color = 'rgba(255,255,255,0.7)';
    emblem.appendChild(emblemText);
  }

  const teamInfo = document.createElement('div');
  teamInfo.style.display = 'flex';
  teamInfo.style.flexDirection = 'column';
  teamInfo.style.gap = '16px';

  const teamName = document.createElement('h2');
  teamName.textContent = team.name;
  teamName.style.margin = '0';
  teamName.style.fontSize = '68px';
  teamName.style.lineHeight = '0.96';
  teamName.style.letterSpacing = '-0.03em';
  teamName.style.textShadow = '0 10px 20px rgba(0,0,0,0.5)';

  const teamGroup = document.createElement('p');
  teamGroup.textContent = team.group || 'Seleção da Copa Unasp';
  teamGroup.style.margin = '0';
  teamGroup.style.fontSize = '30px';
  teamGroup.style.fontWeight = '700';
  teamGroup.style.color = colors.secondary;
  teamGroup.style.textShadow = `0 0 20px ${colors.glow}`;

  const teamLeader = document.createElement('span');
  teamLeader.textContent = team.leader ? `Capitão: ${team.leader}` : 'Capitão a definir';
  teamLeader.style.display = 'inline-flex';
  teamLeader.style.width = 'fit-content';
  teamLeader.style.padding = '10px 16px';
  teamLeader.style.borderRadius = '999px';
  teamLeader.style.fontSize = '18px';
  teamLeader.style.fontWeight = '800';
  teamLeader.style.textTransform = 'uppercase';
  teamLeader.style.letterSpacing = '0.08em';
  teamLeader.style.background = 'rgba(255,255,255,0.09)';
  teamLeader.style.border = '1px solid rgba(255,255,255,0.16)';
  // organize leader and group into chips for clearer hierarchy
  const chips = document.createElement('div');
  chips.style.display = 'flex';
  chips.style.gap = '10px';

  const groupChip = document.createElement('span');
  groupChip.textContent = team.group ? `Grupo ${team.group}` : 'Grupo —';
  groupChip.style.display = 'inline-flex';
  groupChip.style.alignItems = 'center';
  groupChip.style.padding = '8px 12px';
  groupChip.style.borderRadius = '999px';
  groupChip.style.fontSize = '16px';
  groupChip.style.fontWeight = '800';
  groupChip.style.color = colors.secondary;
  groupChip.style.background = 'rgba(255,255,255,0.04)';
  groupChip.style.border = `1px solid rgba(255,255,255,0.08)`;

  const leaderChip = document.createElement('span');
  leaderChip.textContent = team.leader ? `Capitão: ${team.leader}` : 'Capitão a definir';
  leaderChip.style.display = 'inline-flex';
  leaderChip.style.alignItems = 'center';
  leaderChip.style.padding = '8px 12px';
  leaderChip.style.borderRadius = '999px';
  leaderChip.style.fontSize = '14px';
  leaderChip.style.fontWeight = '700';
  leaderChip.style.color = 'rgba(255,255,255,0.9)';
  leaderChip.style.background = 'rgba(255,255,255,0.03)';
  leaderChip.style.border = '1px solid rgba(255,255,255,0.06)';

  chips.append(groupChip, leaderChip);

  teamInfo.append(teamName, teamGroup, chips);
  heroCard.append(emblem, teamInfo);

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.paddingTop = '20px';
  footer.style.borderTop = '1px solid rgba(255,255,255,0.16)';
  footer.style.position = 'relative';
  footer.style.zIndex = '10';

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

  middle.append(heroCard);
  card.append(topRow, middle, footer);

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

export const downloadSocialGroupStandingCard = async ({
  fileName,
  groupName,
  subtitle,
  rows,
}: DownloadSocialGroupStandingCardOptions) => {
  const topRows = rows.slice(0, 4);
  const accentSource = topRows[0]?.badgeUrl;
  let colors = THEME_COLORS.gold;
  let teamAccentRgb: string | null = null;

  if (accentSource) {
    const rgbStr = await getDominantColor(accentSource);
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
    ? `radial-gradient(circle at 85% 15%, rgba(${teamAccentRgb}, 0.48), transparent 48%), radial-gradient(circle at 12% 88%, rgba(${teamAccentRgb}, 0.18), transparent 45%), linear-gradient(135deg, #08111d 0%, #131c31 100%)`
    : `radial-gradient(circle at 85% 15%, ${colors.glow}, transparent 50%), linear-gradient(135deg, #08111d 0%, #131c31 100%)`;
  card.style.border = '2px solid rgba(255,255,255,0.1)';
  card.style.boxShadow = `inset 0 0 100px rgba(0,0,0,0.78), 0 0 42px ${colors.glow}`;
  card.style.position = 'relative';

  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.opacity = '0.035';
  overlay.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")';
  overlay.style.zIndex = '0';
  card.appendChild(overlay);

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'flex-start';
  header.style.gap = '24px';
  header.style.position = 'relative';
  header.style.zIndex = '10';

  const headerText = document.createElement('div');
  headerText.style.display = 'flex';
  headerText.style.flexDirection = 'column';
  headerText.style.gap = '12px';

  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'COPA UNASP 2026';
  eyebrow.style.fontSize = '28px';
  eyebrow.style.letterSpacing = '0.12em';
  eyebrow.style.fontWeight = '800';
  eyebrow.style.color = 'rgba(255,255,255,0.72)';

  const title = document.createElement('h1');
  title.textContent = `Grupo ${groupName}`;
  title.style.margin = '0';
  title.style.fontSize = '78px';
  title.style.lineHeight = '0.96';
  title.style.letterSpacing = '-0.04em';
  title.style.fontWeight = '900';
  title.style.background = `linear-gradient(to right, #ffffff, ${colors.secondary})`;
  title.style.webkitBackgroundClip = 'text';
  title.style.webkitTextFillColor = 'transparent';

  const subtitleEl = document.createElement('p');
  subtitleEl.textContent = subtitle || 'Classificação oficial da fase de grupos';
  subtitleEl.style.margin = '0';
  subtitleEl.style.fontSize = '24px';
  subtitleEl.style.color = 'rgba(255,255,255,0.78)';
  subtitleEl.style.fontWeight = '500';

  headerText.append(eyebrow, title, subtitleEl);

  const badgeWrap = document.createElement('div');
  badgeWrap.style.width = '138px';
  badgeWrap.style.height = '138px';
  badgeWrap.style.borderRadius = '32px';
  badgeWrap.style.border = `2px solid ${colors.secondary}`;
  badgeWrap.style.boxShadow = `0 0 30px ${colors.glow}`;
  badgeWrap.style.background = 'rgba(0,0,0,0.34)';
  badgeWrap.style.display = 'flex';
  badgeWrap.style.alignItems = 'center';
  badgeWrap.style.justifyContent = 'center';
  badgeWrap.style.flexShrink = '0';

  if (accentSource) {
    const badgeImg = document.createElement('img');
    badgeImg.crossOrigin = 'anonymous';
    badgeImg.src = accentSource;
    badgeImg.alt = groupName;
    badgeImg.width = 92;
    badgeImg.height = 92;
    badgeImg.style.objectFit = 'contain';
    badgeWrap.appendChild(badgeImg);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = 'GR';
    fallback.style.fontSize = '36px';
    fallback.style.fontWeight = '900';
    fallback.style.letterSpacing = '0.08em';
    fallback.style.color = 'rgba(255,255,255,0.78)';
    badgeWrap.appendChild(fallback);
  }

  header.append(headerText, badgeWrap);

  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '24px';
  body.style.position = 'relative';
  body.style.zIndex = '10';
  body.style.flex = '1';

  const highlightBand = document.createElement('div');
  highlightBand.style.display = 'grid';
  highlightBand.style.gridTemplateColumns = '1.2fr 0.8fr 0.8fr';
  highlightBand.style.gap = '16px';

  topRows.forEach((row, index) => {
    const tile = document.createElement('div');
    tile.style.padding = '14px';
    tile.style.borderRadius = '20px';
    tile.style.background = index === 0
      ? 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))'
      : 'rgba(255,255,255,0.04)';
    tile.style.border = `1px solid ${index === 0 ? colors.secondary : 'rgba(255,255,255,0.10)'}`;
    tile.style.boxShadow = index === 0 ? `0 6px 26px ${colors.glow}` : 'none';
    tile.style.display = 'flex';
    tile.style.flexDirection = 'row';
    tile.style.alignItems = 'center';
    tile.style.gap = '12px';

    const rankCircle = document.createElement('div');
    rankCircle.style.width = '48px';
    rankCircle.style.height = '48px';
    rankCircle.style.borderRadius = '50%';
    rankCircle.style.display = 'flex';
    rankCircle.style.alignItems = 'center';
    rankCircle.style.justifyContent = 'center';
    rankCircle.style.fontSize = '20px';
    rankCircle.style.fontWeight = '900';
    rankCircle.style.color = '#0b1220';
    rankCircle.style.background = index === 0 ? colors.secondary : 'rgba(255,255,255,0.92)';
    rankCircle.textContent = String(row.rank);

    const badge = document.createElement('div');
    badge.style.width = '48px';
    badge.style.height = '48px';
    badge.style.borderRadius = '8px';
    badge.style.overflow = 'hidden';
    badge.style.flexShrink = '0';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.background = 'rgba(0,0,0,0.12)';
    if (row.badgeUrl) {
      const bimg = document.createElement('img');
      bimg.crossOrigin = 'anonymous';
      bimg.src = row.badgeUrl;
      bimg.alt = row.teamName;
      bimg.width = 44;
      bimg.height = 44;
      bimg.style.objectFit = 'contain';
      badge.appendChild(bimg);
    } else {
      const bb = document.createElement('span');
      bb.textContent = row.teamName.charAt(0).toUpperCase();
      bb.style.fontWeight = '900';
      bb.style.color = 'rgba(255,255,255,0.85)';
      badge.appendChild(bb);
    }

    const nameBox = document.createElement('div');
    nameBox.style.display = 'flex';
    nameBox.style.flexDirection = 'column';
    nameBox.style.gap = '2px';
    nameBox.style.minWidth = '0';

    const teamLine = document.createElement('strong');
    teamLine.textContent = row.teamName;
    teamLine.style.fontSize = '18px';
    teamLine.style.lineHeight = '1.05';
    teamLine.style.overflow = 'hidden';
    teamLine.style.textOverflow = 'ellipsis';
    teamLine.style.whiteSpace = 'nowrap';

    const subLine = document.createElement('span');
    subLine.textContent = `J ${row.played} • W ${row.wins} • D ${row.draws} • L ${row.losses}`;
    subLine.style.fontSize = '12px';
    subLine.style.letterSpacing = '0.06em';
    subLine.style.color = 'rgba(255,255,255,0.72)';

    nameBox.append(teamLine, subLine);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';

    const pointsWrap = document.createElement('div');
    pointsWrap.style.display = 'flex';
    pointsWrap.style.flexDirection = 'column';
    pointsWrap.style.alignItems = 'flex-end';
    pointsWrap.style.gap = '4px';
    pointsWrap.style.minWidth = '96px';

    const ptsVal = document.createElement('strong');
    ptsVal.textContent = String(row.points);
    ptsVal.style.fontSize = '28px';
    ptsVal.style.fontWeight = '900';
    ptsVal.style.color = '#ffffff';
    ptsVal.style.textShadow = `0 0 14px ${colors.glow}`;

    const gd = document.createElement('span');
    gd.textContent = `${row.goalsDiff > 0 ? '+' + row.goalsDiff : row.goalsDiff}`;
    gd.style.fontSize = '14px';
    gd.style.fontWeight = '800';
    gd.style.color = row.goalsDiff > 0 ? '#00e676' : row.goalsDiff < 0 ? '#ff5252' : 'rgba(255,255,255,0.8)';

    pointsWrap.append(ptsVal, gd);

    tile.append(rankCircle, badge, nameBox, spacer, pointsWrap);
    highlightBand.appendChild(tile);
  });

  const detailGrid = document.createElement('div');
  detailGrid.style.display = 'grid';
  detailGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  detailGrid.style.gap = '16px';

  const detailCards = [
    { label: 'Total de equipes', value: rows.length },
    { label: 'Melhor campanha', value: rows[0] ? `${rows[0].points} pontos` : '-' },
    { label: 'Pior saldo', value: rows.length ? String(Math.min(...rows.map((row) => row.goalsDiff))) : '-' },
  ];

  detailCards.forEach((cardItem) => {
    const cardBox = document.createElement('div');
    cardBox.style.padding = '18px 20px';
    cardBox.style.borderRadius = '22px';
    cardBox.style.background = 'rgba(255,255,255,0.06)';
    cardBox.style.border = '1px solid rgba(255,255,255,0.12)';

    const cardLabel = document.createElement('span');
    cardLabel.textContent = cardItem.label;
    cardLabel.style.display = 'block';
    cardLabel.style.fontSize = '12px';
    cardLabel.style.fontWeight = '800';
    cardLabel.style.letterSpacing = '0.14em';
    cardLabel.style.textTransform = 'uppercase';
    cardLabel.style.color = 'rgba(255,255,255,0.66)';

    const cardValue = document.createElement('strong');
    cardValue.textContent = String(cardItem.value);
    cardValue.style.display = 'block';
    cardValue.style.marginTop = '8px';
    cardValue.style.fontSize = '28px';
    cardValue.style.lineHeight = '1';

    cardBox.append(cardLabel, cardValue);
    detailGrid.appendChild(cardBox);
  });

  body.append(highlightBand, detailGrid);

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.paddingTop = '20px';
  footer.style.borderTop = '1px solid rgba(255,255,255,0.16)';
  footer.style.position = 'relative';
  footer.style.zIndex = '10';

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

  card.append(header, body, footer);
  mount.append(card);
  document.body.appendChild(mount);

  try {
    await document.fonts.ready;
    await waitForImages(card);
    const dataUrl = await toPng(card, {
      quality: 1,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#08111d',
    });

    const link = document.createElement('a');
    link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    mount.remove();
  }
};

export const downloadSocialStandingsCard = async ({
  fileName,
  title,
  subtitle,
  groups,
}: DownloadSocialStandingsCardOptions) => {
  const validGroups = groups.filter((group) => group.rows.length > 0);
  if (validGroups.length === 0) return;

  const accentSource = validGroups[0].rows[0]?.badgeUrl;
  let colors = THEME_COLORS.gold;
  let teamAccentRgb: string | null = null;

  if (accentSource) {
    const rgbStr = await getDominantColor(accentSource);
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
  card.style.height = validGroups.length > 1 ? '1740px' : '1440px';
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
    ? `radial-gradient(circle at 85% 15%, rgba(${teamAccentRgb}, 0.5), transparent 50%), radial-gradient(circle at 15% 85%, rgba(${teamAccentRgb}, 0.2), transparent 50%), linear-gradient(135deg, #08111d 0%, #131c31 100%)`
    : `radial-gradient(circle at 85% 15%, ${colors.glow}, transparent 50%), linear-gradient(135deg, #08111d 0%, #131c31 100%)`;
  card.style.border = '2px solid rgba(255,255,255,0.1)';
  card.style.boxShadow = `inset 0 0 100px rgba(0,0,0,0.78), 0 0 42px ${colors.glow}`;
  card.style.position = 'relative';

  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.opacity = '0.03';
  overlay.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")';
  overlay.style.zIndex = '0';
  card.appendChild(overlay);

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'flex-start';
  header.style.gap = '24px';
  header.style.position = 'relative';
  header.style.zIndex = '10';

  const headerText = document.createElement('div');
  headerText.style.display = 'flex';
  headerText.style.flexDirection = 'column';
  headerText.style.gap = '12px';

  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'COPA UNASP 2026';
  eyebrow.style.fontSize = '28px';
  eyebrow.style.letterSpacing = '0.12em';
  eyebrow.style.fontWeight = '800';
  eyebrow.style.color = 'rgba(255,255,255,0.72)';

  const titleEl = document.createElement('h1');
  titleEl.textContent = title || (validGroups.length > 1 ? 'Classificação dos grupos' : `Grupo ${validGroups[0].groupName}`);
  titleEl.style.margin = '0';
  titleEl.style.fontSize = '74px';
  titleEl.style.lineHeight = '0.95';
  titleEl.style.letterSpacing = '-0.04em';
  titleEl.style.fontWeight = '900';
  titleEl.style.background = `linear-gradient(to right, #ffffff, ${colors.secondary})`;
  titleEl.style.webkitBackgroundClip = 'text';
  titleEl.style.webkitTextFillColor = 'transparent';

  const subtitleEl = document.createElement('p');
  subtitleEl.textContent = subtitle || 'Classificação oficial da fase de grupos';
  subtitleEl.style.margin = '0';
  subtitleEl.style.fontSize = '24px';
  subtitleEl.style.color = 'rgba(255,255,255,0.78)';
  subtitleEl.style.fontWeight = '500';

  headerText.append(eyebrow, titleEl, subtitleEl);

  const badgeWrap = document.createElement('div');
  badgeWrap.style.width = '138px';
  badgeWrap.style.height = '138px';
  badgeWrap.style.borderRadius = '32px';
  badgeWrap.style.border = `2px solid ${colors.secondary}`;
  badgeWrap.style.boxShadow = `0 0 30px ${colors.glow}`;
  badgeWrap.style.background = 'rgba(0,0,0,0.34)';
  badgeWrap.style.display = 'flex';
  badgeWrap.style.alignItems = 'center';
  badgeWrap.style.justifyContent = 'center';
  badgeWrap.style.flexShrink = '0';

  if (accentSource) {
    const badgeImg = document.createElement('img');
    badgeImg.crossOrigin = 'anonymous';
    badgeImg.src = accentSource;
    badgeImg.alt = 'Classificação';
    badgeImg.width = 92;
    badgeImg.height = 92;
    badgeImg.style.objectFit = 'contain';
    badgeWrap.appendChild(badgeImg);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = 'GR';
    fallback.style.fontSize = '36px';
    fallback.style.fontWeight = '900';
    fallback.style.letterSpacing = '0.08em';
    fallback.style.color = 'rgba(255,255,255,0.78)';
    badgeWrap.appendChild(fallback);
  }

  header.append(headerText, badgeWrap);

  const body = document.createElement('div');
  body.style.display = 'grid';
  body.style.gridTemplateColumns = validGroups.length > 1 ? '1fr 1fr' : '1fr';
  body.style.gap = '18px';
  body.style.position = 'relative';
  body.style.zIndex = '10';
  body.style.flex = '1';

  const makeCompactRow = (row: SocialCardStandingRow, index: number) => {
    const rowCard = document.createElement('div');
    rowCard.style.display = 'grid';
    rowCard.style.gridTemplateColumns = '58px 1fr 86px';
    rowCard.style.alignItems = 'center';
    rowCard.style.gap = '14px';
    rowCard.style.padding = '14px 16px';
    rowCard.style.borderRadius = '20px';
    rowCard.style.background = index === 0
      ? 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.07))'
      : 'rgba(255,255,255,0.06)';
    rowCard.style.border = `1px solid ${index === 0 ? colors.secondary : 'rgba(255,255,255,0.1)'}`;
    rowCard.style.boxShadow = index === 0 ? `0 0 26px ${colors.glow}` : 'none';

    const rankCircle = document.createElement('div');
    rankCircle.style.width = '46px';
    rankCircle.style.height = '46px';
    rankCircle.style.borderRadius = '50%';
    rankCircle.style.display = 'flex';
    rankCircle.style.alignItems = 'center';
    rankCircle.style.justifyContent = 'center';
    rankCircle.style.fontSize = '18px';
    rankCircle.style.fontWeight = '900';
    rankCircle.style.color = '#0b1220';
    rankCircle.style.background = index === 0 ? colors.secondary : 'rgba(255,255,255,0.92)';
    rankCircle.textContent = String(row.rank);

    const teamBox = document.createElement('div');
    teamBox.style.display = 'flex';
    teamBox.style.flexDirection = 'column';
    teamBox.style.gap = '4px';
    teamBox.style.minWidth = '0';

    const teamLine = document.createElement('strong');
    teamLine.textContent = row.teamName;
    teamLine.style.fontSize = '22px';
    teamLine.style.lineHeight = '1.05';
    teamLine.style.overflow = 'hidden';
    teamLine.style.textOverflow = 'ellipsis';
    teamLine.style.whiteSpace = 'nowrap';

    const statsLine = document.createElement('span');
    statsLine.textContent = `J ${row.played} • V ${row.wins} • E ${row.draws} • D ${row.losses} • SG ${row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}`;
    statsLine.style.fontSize = '12px';
    statsLine.style.letterSpacing = '0.08em';
    statsLine.style.textTransform = 'uppercase';
    statsLine.style.color = 'rgba(255,255,255,0.72)';

    teamBox.append(teamLine, statsLine);

    const pointsBox = document.createElement('div');
    pointsBox.style.display = 'flex';
    pointsBox.style.flexDirection = 'column';
    pointsBox.style.alignItems = 'center';
    pointsBox.style.justifyContent = 'center';
    pointsBox.style.gap = '2px';
    pointsBox.style.padding = '10px 8px';
    pointsBox.style.borderRadius = '16px';
    pointsBox.style.background = 'rgba(0,0,0,0.22)';
    pointsBox.style.border = '1px solid rgba(255,255,255,0.12)';

    const pointsValue = document.createElement('strong');
    pointsValue.textContent = String(row.points);
    pointsValue.style.fontSize = '26px';
    pointsValue.style.lineHeight = '1';
    pointsValue.style.color = '#ffffff';
    pointsValue.style.textShadow = `0 0 16px ${colors.glow}`;

    const pointsLabel = document.createElement('span');
    pointsLabel.textContent = 'PTS';
    pointsLabel.style.fontSize = '11px';
    pointsLabel.style.fontWeight = '900';
    pointsLabel.style.letterSpacing = '0.16em';
    pointsLabel.style.color = 'rgba(255,255,255,0.7)';

    pointsBox.append(pointsValue, pointsLabel);

    rowCard.append(rankCircle, teamBox, pointsBox);
    return rowCard;
  };

  validGroups.forEach((group) => {
    const section = document.createElement('div');
    section.style.padding = '22px';
    section.style.borderRadius = '28px';
    section.style.background = 'rgba(255,255,255,0.05)';
    section.style.border = '1px solid rgba(255,255,255,0.12)';
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '14px';

    const sectionHeader = document.createElement('div');
    sectionHeader.style.display = 'flex';
    sectionHeader.style.justifyContent = 'space-between';
    sectionHeader.style.alignItems = 'center';
    sectionHeader.style.gap = '12px';

    const sectionTitle = document.createElement('div');
    sectionTitle.style.display = 'flex';
    sectionTitle.style.alignItems = 'center';
    sectionTitle.style.gap = '10px';

    const sectionBadge = document.createElement('span');
    sectionBadge.textContent = group.groupName;
    sectionBadge.style.display = 'inline-flex';
    sectionBadge.style.alignItems = 'center';
    sectionBadge.style.justifyContent = 'center';
    sectionBadge.style.minWidth = '54px';
    sectionBadge.style.padding = '8px 14px';
    sectionBadge.style.borderRadius = '999px';
    sectionBadge.style.background = 'rgba(255,255,255,0.1)';
    sectionBadge.style.border = `1px solid ${colors.secondary}`;
    sectionBadge.style.color = colors.secondary;
    sectionBadge.style.fontWeight = '900';
    sectionBadge.style.fontSize = '18px';

    const sectionLabel = document.createElement('strong');
    sectionLabel.textContent = `Grupo ${group.groupName}`;
    sectionLabel.style.fontSize = '28px';
    sectionLabel.style.fontWeight = '900';
    sectionLabel.style.letterSpacing = '-0.02em';

    sectionTitle.append(sectionBadge, sectionLabel);

    const sectionMeta = document.createElement('span');
    sectionMeta.textContent = `${group.rows.length} equipes`;
    sectionMeta.style.fontSize = '12px';
    sectionMeta.style.fontWeight = '800';
    sectionMeta.style.letterSpacing = '0.14em';
    sectionMeta.style.textTransform = 'uppercase';
    sectionMeta.style.color = 'rgba(255,255,255,0.68)';

    sectionHeader.append(sectionTitle, sectionMeta);

    const rowsWrap = document.createElement('div');
    rowsWrap.style.display = 'flex';
    rowsWrap.style.flexDirection = 'column';
    rowsWrap.style.gap = '10px';

    group.rows.forEach((row, index) => {
      rowsWrap.appendChild(makeCompactRow(row, index));
    });

    section.append(sectionHeader, rowsWrap);
    body.appendChild(section);
  });

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.paddingTop = '20px';
  footer.style.borderTop = '1px solid rgba(255,255,255,0.16)';
  footer.style.position = 'relative';
  footer.style.zIndex = '10';

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

  card.append(header, body, footer);
  mount.append(card);
  document.body.appendChild(mount);

  try {
    await document.fonts.ready;
    await waitForImages(card);
    const dataUrl = await toPng(card, {
      quality: 1,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#08111d',
    });

    const link = document.createElement('a');
    link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    mount.remove();
  }
};
