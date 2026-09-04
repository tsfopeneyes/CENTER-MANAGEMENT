import React from 'react';
import {BarChart2,BellRing,Calendar,ClipboardCheck,ClipboardList,FileText,LayoutDashboard,MessageSquare,Monitor,School,Settings,Store,Trophy,UserCheck,Users} from 'lucide-react';
export const ADMIN_SIDEBAR_GROUPS=[
 {id:'CENTER',title:'센터 운영',items:[{id:'STATUS',label:'공간 현황',icon:<LayoutDashboard size={20}/>},{id:'WORK_STATUS',label:'근무 현황',icon:<UserCheck size={20}/>},{id:'SCREEN',label:'전자칠판',icon:<Monitor size={20}/>},{id:'CALENDAR',label:'일정 관리',icon:<Calendar size={20}/>},{id:'PROGRAMS',label:'프로그램 관리',icon:<Users size={20}/>},{id:'COMMUNITY',label:'커뮤니티 관리',icon:<MessageSquare size={20}/>},{id:'CONTENTS_MGMT',label:'콘텐츠 관리',icon:<Store size={20}/>},{id:'RENTAL_MGMT',label:'대관 현황',icon:<ClipboardCheck size={20}/>},{id:'NOTIFICATIONS',label:'알림 보내기',icon:<BellRing size={20}/>},{id:'BADGES',label:'뱃지 관리',icon:<Trophy size={20}/>},{id:'BOARD',label:'공지사항',icon:<MessageSquare size={20}/>},{id:'STORE',label:'하이픈 스토어',icon:<Store size={20}/>},{id:'DUTY',label:'당직 관리',icon:<ClipboardCheck size={20}/>} ]},
 {id:'USERS',title:'이용자 관리',items:[{id:'USERS',label:'이용자 목록',icon:<Users size={20}/>},{id:'SCHOOLS',label:'학교 관리',icon:<School size={20}/>},{id:'SURVEYS',label:'설문조사',icon:<ClipboardList size={20}/>} ]},
 {id:'DATABASE',title:'DB 관리',items:[{id:'STATISTICS',label:'통계',icon:<BarChart2 size={20}/>},{id:'LOGS',label:'로그',icon:<FileText size={20}/>},{id:'REPORTS',label:'운영 리포트',icon:<FileText size={20}/>} ]},
 {id:'ETC',title:'기타',items:[{id:'SETTINGS',label:'설정',icon:<Settings size={20}/>} ]}
];
export const DEFAULT_ADMIN_SIDEBAR_CONFIG=ADMIN_SIDEBAR_GROUPS.flatMap((group,groupIndex)=>group.items.map((item,order)=>({id:item.id,label:item.label,isVisible:true,groupId:group.id,groupTitle:group.title,groupIndex,groupOrder:groupIndex,order})));
