import {useLayoutEffect,useRef,useState} from 'react';
import {Menu} from '@base-ui/react/menu';
import {Ellipsis,FolderOpen,HardDriveDownload,Plus,Subtitles} from 'lucide-react';
type Props={onOpen:()=>void;onExport:()=>void;onNew:()=>void;onPackage:()=>void;canPackage:boolean};
export function ProjectMenu({onOpen,onExport,onNew,onPackage,canPackage}:Props){
 const trigger=useRef<HTMLButtonElement>(null);
 const [container,setContainer]=useState<HTMLElement|ShadowRoot|null>(null);
 useLayoutEffect(()=>{const root=trigger.current?.getRootNode();setContainer(root instanceof ShadowRoot?root:document.body)},[]);
 return <Menu.Root><Menu.Trigger ref={trigger} className="btn outline caption-more" aria-label="工程操作"><Ellipsis size={17}/><span>更多</span></Menu.Trigger>
 {container&&<Menu.Portal container={container}><Menu.Positioner align="end" sideOffset={6} collisionPadding={10} className="caption-menu-positioner"><Menu.Popup className="caption-project-menu">
 <Menu.Item className="caption-menu-item" onClick={onOpen}><FolderOpen size={16}/>打开工程</Menu.Item>
 <Menu.Item className="caption-menu-item" onClick={onExport}><HardDriveDownload size={16}/>导出工程</Menu.Item>
 <Menu.Item className="caption-menu-item" onClick={onNew}><Plus size={16}/>新建工程</Menu.Item>
 <Menu.Separator className="caption-menu-divider"/>
 <Menu.Item className="caption-menu-item" disabled={!canPackage} onClick={onPackage}><Subtitles size={16}/>封装软字幕</Menu.Item>
 </Menu.Popup></Menu.Positioner></Menu.Portal>}</Menu.Root>
}
