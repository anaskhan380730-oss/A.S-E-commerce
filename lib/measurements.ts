export type MeasurementDefinition={key:string;label:string;required:boolean;min:number;max:number;guide?:string};
export function measurementGroups(template:unknown,slug=''):{group:string;fields:MeasurementDefinition[]}[]{
 const fallback=slug.includes('trouser')?['Length','Waist','Hip','Thigh','Knee','Bottom opening','Rise']:slug.includes('shalwar')?['Length','Waist','Hip','Thigh','Bottom opening']:['Length','Chest','Waist','Hip','Shoulder','Sleeve length','Armhole'];
 const normalize=(v:unknown):MeasurementDefinition|null=>{if(typeof v==='string')return{key:v,label:v,required:true,min:1,max:500};if(!v||typeof v!=='object')return null;const x=v as Record<string,unknown>;if(typeof x.key!=='string'||typeof x.label!=='string')return null;return{key:x.key,label:x.label,required:x.required!==false,min:typeof x.min==='number'?x.min:1,max:typeof x.max==='number'?x.max:500,guide:typeof x.guide==='string'?x.guide:undefined}};
 if(Array.isArray(template)){const fields=template.map(normalize).filter((x):x is MeasurementDefinition=>!!x);if(fields.length)return[{group:'Measurements',fields}]}
 if(template&&typeof template==='object'){const groups=Object.entries(template as Record<string,unknown>).flatMap(([group,values])=>Array.isArray(values)?[{group,fields:values.map(normalize).filter((x):x is MeasurementDefinition=>!!x)}]:[]).filter(g=>g.fields.length);if(groups.length)return groups}
 return[{group:'Measurements',fields:fallback.map(x=>({key:x,label:x,required:true,min:1,max:500}))}];
}
