import type {DetailedHTMLProps,HTMLAttributes} from 'react';
type MediaElement=DetailedHTMLProps<HTMLAttributes<HTMLElement>,HTMLElement>&{
 noautohide?:string;gesturesdisabled?:string;nohotkeys?:string;seekoffset?:string;showduration?:string;rates?:string;slot?:string
};
declare module 'react'{
 namespace JSX{
  interface IntrinsicElements{
   'media-controller':MediaElement;
   'media-control-bar':MediaElement;
   'media-play-button':MediaElement;
   'media-seek-backward-button':MediaElement;
   'media-seek-forward-button':MediaElement;
   'media-time-range':MediaElement;
   'media-time-display':MediaElement;
   'media-mute-button':MediaElement;
   'media-volume-range':MediaElement;
   'media-playback-rate-button':MediaElement;
   'media-pip-button':MediaElement;
   'media-loading-indicator':MediaElement;
  }
 }
}
