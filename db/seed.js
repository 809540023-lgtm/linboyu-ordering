// ===== 資料庫種子填充 =====
const dayjs = require('dayjs');

async function seed() {
  const db = require('./init');
  await db.waitReady();

  console.log('🌱 開始填充測試資料...\n');

  try {
    // ===== 1. 清空現有資料 =====
    console.log('清空現有資料...');
    db.exec(`
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM daily_inventory;
      DELETE FROM products;
      DELETE FROM discount_codes;
      DELETE FROM customers;
      DELETE FROM daily_summary;
      DELETE FROM line_messages;
      DELETE FROM settings;
      DELETE FROM sqlite_sequence;
    `);

    // ===== 2. 插入 5 個示例品項 =====
    console.log('建立示例品項...');
    const productData = [
      { code: 'A', name: '（待設定A）', price: 80, cost: 25 },
      { code: 'B', name: '（待設定B）', price: 90, cost: 28 },
      { code: 'C', name: '（待設定C）', price: 100, cost: 32 },
      { code: 'D', name: '（待設定D）', price: 120, cost: 40 },
      { code: 'E', name: '（待設定E）', price: 150, cost: 50 }
    ];

    const insertProduct = db.prepare(`
      INSERT INTO products (code, name, description, price, cost, daily_quota, emoji, status, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    productData.forEach((p, idx) => {
      insertProduct.run(
        p.code, p.name,
        '白飯80g + 主食 + 時蔬2樣 + 例湯',
        p.price, p.cost,
        18, '🍱', 'active', idx
      );
    });
    console.log('✅ 已建立 5 個品項\n');

    // ===== 3. 插入預設折扣碼 =====
    console.log('建立折扣碼...');
    const discountData = [
      { code: 'LINBOYU01', type: 'general', rate: 0.8, max: 999,
        from: dayjs().subtract(1, 'month').toISOString(),
        until: dayjs().add(3, 'month').toISOString() },
      { code: 'OPEN2026', type: 'event', rate: 0.85, max: 100,
        from: dayjs().toISOString(),
        until: dayjs().add(1, 'month').toISOString() },
      { code: 'EARLY20', type: 'telemarketing', rate: 0.9, max: 50,
        from: dayjs().toISOString(),
        until: dayjs().add(2, 'month').toISOString() }
    ];

    const insertDiscount = db.prepare(`
      INSERT INTO discount_codes (code, type, discount_rate, max_uses, valid_from, valid_until, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    discountData.forEach(d => {
      insertDiscount.run(d.code, d.type, d.rate, d.max, d.from, d.until, 'active');
    });
    console.log('✅ 已建立 3 個折扣碼\n');

    // ===== 4. 插入系統設定 =====
    console.log('建立系統設定...');
    const settings = {
      shop_name: '纖體食驗室 × 林博御AI膳',
      shop_phone: '0912345678',
      shop_email: 'info@linboyu.com',
      shop_address: '新北市泰山區楓江路40-2號',
      business_hours: '10:00-20:00',
      daily_quota: '90',
      delivery_fee: '30',
      delivery_area: '新北市',
      admin_password_hash: 'demo123',
      line_channel_id: 'YOUR_LINE_CHANNEL_ID',
      line_channel_secret: 'YOUR_LINE_CHANNEL_SECRET',
      newebpay_merchant_id: 'YOUR_NEWEBPAY_ID',
      newebpay_hash_key: 'YOUR_NEWEBPAY_KEY',
      newebpay_hash_iv: 'YOUR_NEWEBPAY_IV',
      ecpay_merchant_id: 'YOUR_ECPAY_ID',
      ecpay_hash_key: 'YOUR_ECPAY_KEY',
      timezone: 'Asia/Taipei'
    };

    const insertSetting = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
    Object.entries(settings).forEach(([key, value]) => {
      insertSetting.run(key, String(value));
    });
    console.log('✅ 已建立系統設定\n');

    // ===== 5. 插入示例客戶 =====
    console.log('建立示例客戶...');
    const customers = [
      { name: '王小美', phone: '0912111111', email: 'wang@example.com', tag: 'regular' },
      { name: '李健身', phone: '0912222222', email: 'li@example.com', tag: 'vip' },
      { name: '陳新客', phone: '0912333333', email: 'chen@example.com', tag: 'new' }
    ];

    const insertCustomer = db.prepare(`INSERT INTO customers (name, phone, email, tag) VALUES (?, ?, ?, ?)`);
    customers.forEach(c => {
      insertCustomer.run(c.name, c.phone, c.email, c.tag);
    });
    console.log('✅ 已建立 3 個示例客戶\n');

    // ===== 6. 為未來 7 天生成庫存 =====
    console.log('為未來 7 天生成每日庫存...');
    const products = db.prepare('SELECT id FROM products').all();
    const insertInventory = db.prepare(`
      INSERT OR REPLACE INTO daily_inventory (date, product_id, total_qty, sold_qty) VALUES (?, ?, ?, 0)
    `);

    for (let i = 0; i < 7; i++) {
      const date = dayjs().add(i, 'day').format('YYYY-MM-DD');
      products.forEach(p => {
        insertInventory.run(date, p.id, 18);
      });
    }
    console.log('✅ 已生成 7 天庫存\n');

    console.log('🎉 資料庫種子填充完成！');
    console.log('\n📋 預設折扣碼:');
    console.log('  - LINBOYU01 (8折，無限使用)');
    console.log('  - OPEN2026 (8.5折，最多100次)');
    console.log('  - EARLY20 (9折，最多50次)');
    console.log('\n👥 預設客戶:');
    customers.forEach(c => console.log(`  - ${c.name} (${c.phone})`));

  } catch (err) {
    console.error('❌ 填充失敗:', err.message);
    process.exit(1);
  }

  db.close();
}

seed();
