import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const field=(key:string,label:string,min=1,max=500)=>({key,label,required:true,min,max});

async function main(){
 const categories=[
  {name:'Ladies Trousers',slug:'trousers',measurementFields:[field('Length','Length'),field('Waist','Waist'),field('Hip','Hip'),field('Thigh','Thigh'),field('Knee','Knee'),field('Bottom opening','Bottom opening'),field('Rise','Rise')]},
  {name:'Festive Shalwar',slug:'festive-shalwar',measurementFields:[field('Length','Length'),field('Waist','Waist'),field('Hip','Hip'),field('Thigh','Thigh'),field('Bottom opening','Bottom opening')]},
  {name:'Ladies Kurtis',slug:'ladies-kurtis',measurementFields:[field('Length','Length'),field('Chest','Chest'),field('Waist','Waist'),field('Hip','Hip'),field('Shoulder','Shoulder'),field('Sleeve length','Sleeve length'),field('Armhole','Armhole')]},
  {name:'Kurti & Pajama Sets',slug:'kurti-pajama-sets',measurementFields:{Kurti:[field('Kurti length','Length'),field('Chest','Chest'),field('Waist','Waist'),field('Hip','Hip'),field('Shoulder','Shoulder'),field('Sleeve length','Sleeve length'),field('Armhole','Armhole')],Pajama:[field('Pajama length','Length'),field('Pajama waist','Waist'),field('Pajama hip','Hip'),field('Pajama thigh','Thigh'),field('Pajama bottom opening','Bottom opening')]}}
 ];
 for(const c of categories)await db.category.upsert({where:{slug:c.slug},update:{},create:{...c,customMeasurements:true}});
 const sections=[
  ['hero','A softer kind of statement.','Modern Pakistani silhouettes, made to be treasured.','Explore the collection','/collections/new-arrivals'],
  ['trousers','Ladies Trousers','Considered cuts and beautiful everyday details.','Shop trousers','/collections/trousers'],
  ['festive-shalwar','Festive Shalwar','A refined take on celebration dressing.','Shop festive shalwar','/collections/festive-shalwar'],
  ['ladies-kurtis','Ladies Kurtis','Effortless silhouettes for every day.','Shop kurtis','/collections/ladies-kurtis'],
  ['kurti-pajama-sets','Kurti & Pajama Sets','Thoughtful pairings, ready to wear.','Shop sets','/collections/kurti-pajama-sets'],
  ['featured','Featured Products','Pieces to return to, season after season.','Discover more','/collections/best-sellers'],
  ['new-arrivals','New Arrivals','Fresh expressions in timeless silhouettes.','Shop new arrivals','/collections/new-arrivals'],
  ['offers','Special Offers','A little something for your next favourite.','View offers','/collections/offers']
 ];
 for(let i=0;i<sections.length;i++){const[key,title,subtitle,buttonLabel,buttonUrl]=sections[i];await db.siteSection.upsert({where:{key},update:{},create:{key,title,subtitle,buttonLabel,buttonUrl,sortOrder:i}});}
 const email=process.env.ADMIN_EMAIL?.toLowerCase(),password=process.env.ADMIN_PASSWORD;if(!email||!password||password==='change-this-before-use')throw new Error('Set a private ADMIN_EMAIL and change ADMIN_PASSWORD in .env before seeding.');
 const passwordHash=await bcrypt.hash(password,12);await db.adminUser.upsert({where:{email},update:{},create:{email,passwordHash}});
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
