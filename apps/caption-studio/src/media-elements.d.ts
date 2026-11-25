import type {DetailedHTMLProps,HTMLAttributes} from 'react';
type MediaElement=DetailedHTMLProps<HTMLAttributes<HTMLElement>,HTMLElement>&{
 noautohide?:string;gesturesdisabled?:string;nohotkeys?:string;seekoffset?:string;showduration?:string;rates?:string;slot?:string;anchor?:string
};
declare module 'react'{
 namespace JSX{
  interface IntrinsicElements{
   'fluent-checkbox':DetailedHTMLProps<HTMLAttributes<HTMLElement&{checked:boolean;indeterminate:boolean;disabled:boolean}>,HTMLElement&{checked:boolean;indeterminate:boolean;disabled:boolean}>&{disabled?:boolean};
   'fluent-button':MediaElement&{type?:string;appearance?:string;size?:string;disabled?:boolean};
   'fluent-progress-bar':MediaElement&{value?:number;min?:number;max?:number;thickness?:string};
   'media-controller':MediaElement;
   'media-control-bar':MediaElement;
   'media-play-button':MediaElement;
   'media-seek-backward-button':MediaElement;
   'media-seek-forward-button':MediaElement;
   'media-time-range':MediaElement;
   'media-time-display':MediaElement;
   'media-mute-button':MediaElement;
   'media-volume-range':MediaElement;
   'media-playback-rate-menu-button':MediaElement;
   'media-playback-rate-menu':MediaElement;
   'media-pip-button':MediaElement;
   'media-loading-indicator':MediaElement;
  }
 }
}
