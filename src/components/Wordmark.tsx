import { memo } from 'react';
import { SvgXml } from 'react-native-svg';
import { BRAND_FONTS, HangedBrand } from '../brand/brand';
import { useTranslation } from '../i18n';

/** The brand's wordmark, still (design/brand/brand.js): the tiles only, or with their balloons. */
export const Wordmark = memo(function Wordmark({ width, balloons = false }: { width: number; balloons?: boolean }) {
  const t = useTranslation();
  const box = balloons ? HangedBrand.BOX : HangedBrand.BOX_COMPACT;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}">` +
    HangedBrand.wordmark({ word: t('brand.word'), tagline: t('brand.tagline'), fonts: BRAND_FONTS, balloons, bob: 0 }) + `</svg>`;
  return <SvgXml xml={xml} width={width} height={(width * box[3]) / box[2]} />;
});
