export type CardType="basic_repair"|"advanced_repair"|"raise_morale"|"command"|"replicate"|"brawl"|"backstab"|"panic"|"airlock"|"explosion"|"reactor";
type Deck=Partial<Record<CardType,number>>;
export const EMMA:Deck={basic_repair:5,advanced_repair:4,raise_morale:4,airlock:2,explosion:1,reactor:1,panic:1,brawl:1,backstab:1};
export type Side="menace"|"crew"|"neutral";
export const AGENDAS:Record<string,{side:Side;deck:Deck}>={
 contagion:{side:"menace",deck:{airlock:6,explosion:4,panic:3}},
 butcher:{side:"menace",deck:{backstab:7,panic:3,reactor:3}},
 austere:{side:"crew",deck:{basic_repair:4,raise_morale:4,replicate:3,brawl:2}},
 loyal:{side:"crew",deck:{basic_repair:5,raise_morale:4,advanced_repair:4}},
 paragon:{side:"crew",deck:{basic_repair:5,raise_morale:5,replicate:3}},
 reckless:{side:"crew",deck:{basic_repair:4,backstab:4,advanced_repair:3,panic:2}},
 resolute:{side:"crew",deck:{basic_repair:5,advanced_repair:4,replicate:2,airlock:2}},
 vengeant:{side:"crew",deck:{basic_repair:6,reactor:1,advanced_repair:2,brawl:4}},
 saint:{side:"crew",deck:{raise_morale:6,command:3,advanced_repair:4}},
 coward:{side:"neutral",deck:{basic_repair:6,backstab:3,airlock:2,explosion:2}},
};
export type Ability="bloodwork"|"first_aid"|"veto"|"laser_pistol"|"delegate"|"commandeer"|"salvage"|"crunch"|"strategize"|"moxie"|"todays_special"|"helping_hand"|"mimic"|"deflect"|"regenerate"|"rewind"|"efficiency"|"formulate"|"system_refresh"|"synchronize"|"surveillance"|"equip"|"resupply"|"rush"|"restructure"|"damage_control"|"guard"|"lockdown";
/** o=氧气 e=能量 d=弃牌 */
export const COST:Record<Ability,{o?:number;e?:number;d?:number}>={bloodwork:{o:1},first_aid:{o:2},veto:{d:1},laser_pistol:{e:2},delegate:{},commandeer:{e:1},salvage:{o:1,d:1},crunch:{o:1},strategize:{},moxie:{o:1},todays_special:{o:1},helping_hand:{},mimic:{},deflect:{},regenerate:{o:1},rewind:{},efficiency:{},formulate:{o:1},system_refresh:{e:1},synchronize:{o:1},surveillance:{e:1},equip:{d:1},resupply:{o:1},rush:{},restructure:{e:1},damage_control:{e:1},guard:{},lockdown:{o:1}};
export const CHARACTERS:Record<string,{ab:[Ability,Ability];deck:Deck}>={
 rotti:{ab:["bloodwork","first_aid"],deck:{raise_morale:5,basic_repair:2}},
 malumil:{ab:["veto","laser_pistol"],deck:{basic_repair:3,command:2,raise_morale:2}},
 andrew:{ab:["delegate","commandeer"],deck:{backstab:3,basic_repair:2,command:2}},
 shnn:{ab:["delegate","salvage"],deck:{basic_repair:2,advanced_repair:2,replicate:2,airlock:1}},
 dekka:{ab:["crunch","strategize"],deck:{command:3,raise_morale:3,basic_repair:1}},
 martella:{ab:["crunch","moxie"],deck:{brawl:3,basic_repair:2,raise_morale:2}},
 tove:{ab:["todays_special","first_aid"],deck:{raise_morale:5,basic_repair:1,backstab:1}},
 aerril:{ab:["helping_hand","mimic"],deck:{raise_morale:5,basic_repair:2}},
 moe:{ab:["deflect","regenerate"],deck:{brawl:2,basic_repair:1,replicate:2,backstab:2}},
 beepo:{ab:["rewind","mimic"],deck:{replicate:4,basic_repair:1,advanced_repair:1,raise_morale:1}},
 sigmund:{ab:["efficiency","formulate"],deck:{basic_repair:2,command:2,advanced_repair:1,raise_morale:1,brawl:1}},
 rhea:{ab:["efficiency","system_refresh"],deck:{advanced_repair:4,replicate:3}},
 cecilia:{ab:["synchronize","surveillance"],deck:{replicate:3,raise_morale:3,basic_repair:1}},
 prillig:{ab:["lockdown","surveillance"],deck:{brawl:3,basic_repair:2,replicate:2}},
 azi:{ab:["equip","resupply"],deck:{brawl:2,advanced_repair:2,raise_morale:2,panic:1}},
 iza:{ab:["rush","restructure"],deck:{basic_repair:3,command:2,explosion:2}},
 ruggine:{ab:["rush","damage_control"],deck:{advanced_repair:3,backstab:3,basic_repair:1}},
 gurg:{ab:["guard","laser_pistol"],deck:{brawl:3,basic_repair:2,advanced_repair:2}},
};
export type WoundType="flesh"|"brain_damage"|"broken_limbs"|"concussion"|"frenzied"|"punctured_lung"|"pulverized"|"radiation_burns"|"severed"|"crushed_windpipe"|"mental_breakdown";
export const WOUNDS:WoundType[]=["flesh","flesh","flesh","flesh","flesh","brain_damage","broken_limbs","concussion","frenzied","punctured_lung","pulverized","radiation_burns","severed","crushed_windpipe","mental_breakdown"];
export const SETUP:Record<number,{menace:number;crew:number;saint:boolean;coward:boolean;oxygen:number}>={4:{menace:1,crew:3,saint:false,coward:false,oxygen:15},5:{menace:2,crew:3,saint:false,coward:false,oxygen:18},6:{menace:2,crew:3,saint:true,coward:false,oxygen:20},7:{menace:2,crew:3,saint:true,coward:true,oxygen:22},8:{menace:2,crew:4,saint:true,coward:true,oxygen:24}};
export const ENERGY_GOAL=20,ENERGY_SAFE=14,OXYGEN_MAX=24;
