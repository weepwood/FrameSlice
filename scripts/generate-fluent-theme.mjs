import {webLightTheme,webDarkTheme} from '@fluentui/tokens';
import {writeFileSync} from 'node:fs';
const aliases={
 '--fs-bg':'colorNeutralBackground3','--fs-surface':'colorNeutralBackground1','--fs-raised':'colorNeutralBackground2',
 '--fs-input':'colorNeutralBackground1','--fs-text':'colorNeutralForeground1','--fs-muted':'colorNeutralForeground2',
 '--fs-border':'colorNeutralStroke2','--fs-accent':'colorBrandForeground1','--fs-brand-fill':'colorBrandBackground','--fs-on-accent':'colorNeutralForegroundOnBrand',
 '--fs-selected':'colorNeutralBackground1Selected','--fs-focus':'colorCompoundBrandStroke','--fs-danger':'colorPaletteRedForeground1',
 '--fs-warning':'colorPaletteDarkOrangeForeground1','--fs-success':'colorPaletteGreenForeground1',
 '--fs-radius':'borderRadiusMedium','--fs-panel-radius':'borderRadiusLarge','--fs-panel-shadow':'shadow2',
 '--fs-font':'fontFamilyBase'
};
const declarations=t=>Object.entries(t).map(([k,v])=>'  --'+k+':'+v+';').join('\n')+'\n'+Object.entries(aliases).map(([k,v])=>'  '+k+':var(--'+v+');').join('\n');
writeFileSync(new URL('../src/assets/fluent-theme.css',import.meta.url),
 '/* Generated from Microsoft @fluentui/tokens (MIT), webLightTheme/webDarkTheme. Do not edit by hand. */\n'+
 ':root,:root[data-fs-theme="light"] {\n'+declarations(webLightTheme)+'\n}\n'+
 ':root[data-fs-theme="dark"] {\n'+declarations(webDarkTheme)+'\n}\n'+
 '@media(prefers-color-scheme:dark){:root:not([data-fs-theme="light"]){\n'+declarations(webDarkTheme)+'\n}}\n');
