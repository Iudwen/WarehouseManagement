import React from 'react';

export default function WarehouseMap() {
  const racks = ['Kệ A', 'Kệ B', 'Kệ C'];
  const levels = ['Tầng 5', 'Tầng 4', 'Tầng 3', 'Tầng 2', 'Tầng 1'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản Lý Tồn Kho - SƠ ĐỒ VỊ TRÍ KHO</h1>
          <p className="text-xs text-slate-500 mt-1">Sơ đồ trực quan các ô vị trí kệ hàng tại Kho Hà Nội (HN01)</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-white border border-slate-300 text-xs font-semibold rounded-lg shadow-sm">Đổi Sơ Đồ</button>
          <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg shadow-sm hover:bg-blue-700">Theo Vị Trí</button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Main Shelf Layout */}
        <div className="col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-around border-b pb-3 font-bold text-slate-700">
            {racks.map(r => <span key={r}>{r}</span>)}
          </div>
          
          <div className="space-y-3">
            {levels.map((lvl, index) => (
              <div key={lvl} className="flex items-center gap-4">
                <span className="w-16 text-xs font-semibold text-slate-500 text-right">{lvl}</span>
                <div className="flex-1 grid grid-cols-3 gap-6">
                  {/* Rack A Cell */}
                  <div className={`h-12 rounded-lg border flex items-center justify-center text-xs font-bold ${
                    index % 2 === 0 ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-slate-100 border-slate-300 text-slate-600'
                  }`}>
                    A-0{5 - index}-01
                  </div>
                  {/* Rack B Cell */}
                  <div className={`h-12 rounded-lg border flex items-center justify-center text-xs font-bold ${
                    index === 2 ? 'bg-emerald-500 text-white border-emerald-600 shadow-md ring-2 ring-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                  }`}>
                    B-0{5 - index}-02
                  </div>
                  {/* Rack C Cell */}
                  <div className={`h-12 rounded-lg border flex items-center justify-center text-xs font-bold ${
                    index === 1 ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-slate-100 border-slate-300 text-slate-600'
                  }`}>
                    C-0{5 - index}-03
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-6 pt-4 border-t text-xs font-semibold">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-slate-200 rounded"></span> Ô Trống (Empty)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-500 rounded"></span> Sắp Đầy (70%)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded"></span> Đang Chọn / Thao Tác</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-500 rounded"></span> Cảnh Báo Đầy</span>
          </div>
        </div>

        {/* Shelf Detail Sidebar Panel */}
        <div className="col-span-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 border-b pb-2">Chi Tiết Vị Trí: B-03-02</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Sức chứa:</span>
              <span className="font-bold text-slate-800">85% Capacity</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-[85%]"></div>
            </div>

            <div className="pt-2 space-y-2">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <div className="font-bold text-xs text-slate-800">TV OLED 55 Inch</div>
                  <div className="text-[10px] text-slate-500">SKU: SP_TV_OLED_55</div>
                </div>
                <span className="font-extrabold text-blue-600 text-sm">39 SP</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <div className="font-bold text-xs text-slate-800">Tủ lạnh 400L</div>
                  <div className="text-[10px] text-slate-500">SKU: SP_TU_LANH_400L</div>
                </div>
                <span className="font-extrabold text-blue-600 text-sm">20 SP</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}