const PRODUCTS = [
  {
    id: 'bread',
    code: 'น',
    name: 'ขนมปังเนยหนึบ',
    subtitle: 'ปังกรอบเนยหนึบ รสเนยนม',
    price: 120,
    unit: 'ถุง',
    badge: 'ขายดี',
    desc: 'ปังกรอบอบเนยสด เนื้อหนึบเคี้ยวเพลิน แช่เย็นแล้วยิ่งหนึบหนับกว่าเดิม บรรจุถุงซิปล็อกอย่างดี',
    images: [
      { src: 'images/bread-1.jpg', alt: 'ขนมปังเนยหนึบ บรรจุถุง', tag: 'น1' },
      { src: 'images/bread-2.jpg', alt: 'ขนมปังเนยหนึบ จัดเรียงพร้อมส่ง', tag: 'น2' }
    ]
  },
  {
    id: 'brownie',
    code: 'บ',
    name: 'บราวนี่',
    subtitle: 'บราวนี่หน้ากรอบ อัลมอนด์',
    price: 150,
    unit: 'กล่อง',
    badge: 'แนะนำ',
    desc: 'บราวนี่เนื้อหนุบหนับ ช็อกโกแลตเข้มข้น โรยอัลมอนด์สไลซ์อบหอม บรรจุกล่องละ 4 ชิ้น',
    images: [
      { src: 'images/brownie-1.jpg', alt: 'บราวนี่อัลมอนด์ บรรจุกล่อง', tag: 'บ1' },
      { src: 'images/brownie-2.jpg', alt: 'บราวนี่อบใหม่จำนวนมาก', tag: 'บ2' }
    ]
  },
  {
    id: 'popcorn',
    code: 'ป',
    name: 'ป็อปคอร์นคาราเมล',
    subtitle: 'คาราเมลถั่วรวม',
    price: 200,
    unit: 'กระปุก',
    badge: 'ของฝาก',
    desc: 'ป็อปคอร์นเคลือบคาราเมลกรอบ ผสมอัลมอนด์และเม็ดมะม่วงหิมพานต์ บรรจุกระปุกฝาล็อกแน่น',
    images: [
      { src: 'images/popcorn-1.jpg', alt: 'ป็อปคอร์นคาราเมล กระปุกใหญ่', tag: 'ป1' },
      { src: 'images/popcorn-2.jpg', alt: 'ป็อปคอร์นคาราเมล เรียงเป็นพีระมิด', tag: 'ป2' }
    ]
  }
];

const SHOP = {
  name: 'ขนมปังปุญ',
  tagline: 'ขนมอบใหม่ทุกวัน',
  phone: '063-424-4659',
  phoneRaw: '0634244659',
  facebook: 'worawan chanphuang',
  ig: 'ornypooh',
  promptpay: '063-424-4659'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PRODUCTS, SHOP };
}
