/** Same-faith pillar page URLs for internal linking. */

const PILLARS = {
  catholic: '/three-major-branches-of-christianity/',
  christian: '/three-major-branches-of-christianity/',
  protestant: '/three-major-branches-of-christianity/',
  muslim: '/what-is-islam/',
  islam: '/what-is-islam/',
  jewish: '/what-is-judaism/',
  judaism: '/what-is-judaism/',
  hindu: '/what-is-hinduism/',
  hinduism: '/what-is-hinduism/',
  buddhist: '/what-is-buddhism/',
  buddhism: '/what-is-buddhism/',
  sikh: '/what-is-sikhism/',
  sikhism: '/what-is-sikhism/',
};

const SITE = 'https://whatreligionisinfo.com';

export function getPillarPageUrl(religion) {
  if (!religion) return null;
  const key = religion.toLowerCase().trim();
  for (const [needle, path] of Object.entries(PILLARS)) {
    if (key.includes(needle)) {
      return `${SITE}${path}`;
    }
  }
  return `${SITE}/`;
}

export function buildPillarLinkHtml(religion) {
  const url = getPillarPageUrl(religion);
  if (!url || url === `${SITE}/`) return '';
  return `<p>Learn more about this faith tradition on our <a href="${url}">pillar guide</a>.</p>`;
}

export { PILLARS };
