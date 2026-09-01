import type { EnginePartMetadata } from '../types';

const parts = [
  {
    id: 'engine-block', nameZh: '气缸体', nameEn: 'Cylinder block',
    materialZh: '蠕墨铸铁', materialEn: 'Compacted graphite iron',
    manufacturingZh: '砂型铸造、镗削与珩磨', manufacturingEn: 'Sand cast, bored and honed',
    functionZh: '支承气缸、主轴承与冷却水套。', functionEn: 'Supports cylinders, main bearings and coolant jackets.',
    keyParameters: ['Inline-4', 'Bore 86 mm', 'Five main bearings'], system: 'structure',
  },
  {
    id: 'cylinder-head', nameZh: '气缸盖', nameEn: 'Cylinder head',
    materialZh: '铝合金', materialEn: 'Aluminium alloy',
    manufacturingZh: '重力铸造与精密机加工', manufacturingEn: 'Gravity cast and precision machined',
    functionZh: '封闭燃烧室并承载气门、喷油器和气道。', functionEn: 'Closes the chambers and carries valves, injectors and ports.',
    keyParameters: ['DOHC', '4 valves/cylinder', 'Central injector'], system: 'structure',
  },
  {
    id: 'oil-pan', nameZh: '油底壳', nameEn: 'Oil sump',
    materialZh: '冲压钢', materialEn: 'Pressed steel',
    manufacturingZh: '深拉冲压与焊接', manufacturingEn: 'Deep drawn and welded',
    functionZh: '储存回流润滑油并辅助散热。', functionEn: 'Stores returning lubricant and rejects heat.',
    keyParameters: ['Wet sump', 'Approx. 6 L'], system: 'lubrication',
  },
  {
    id: 'piston', nameZh: '活塞与活塞环', nameEn: 'Piston & rings',
    materialZh: '铝硅合金 / 合金铸铁', materialEn: 'Al-Si alloy / alloyed cast iron',
    manufacturingZh: '锻造或铸造、椭圆精车', manufacturingEn: 'Forged or cast, profile turned',
    functionZh: '密封缸压并将燃气力传递到连杆。', functionEn: 'Seals cylinder pressure and transmits gas force to the rod.',
    keyParameters: ['3-ring pack', 'Re-entrant diesel bowl'], system: 'cranktrain',
  },
  {
    id: 'wrist-pin', nameZh: '活塞销', nameEn: 'Wrist pin',
    materialZh: '渗碳合金钢', materialEn: 'Case-hardened alloy steel',
    manufacturingZh: '精密磨削与渗碳', manufacturingEn: 'Precision ground and carburized',
    functionZh: '连接活塞与连杆小头并允许摆动。', functionEn: 'Joins piston to small-end while allowing articulation.',
    keyParameters: ['Full-floating', 'Hollow section'], system: 'cranktrain',
  },
  {
    id: 'connecting-rod', nameZh: '连杆', nameEn: 'Connecting rod',
    materialZh: '锻钢', materialEn: 'Forged steel',
    manufacturingZh: '模锻、裂解与机加工', manufacturingEn: 'Drop forged, fracture split and machined',
    functionZh: '把活塞往复运动转换为曲轴旋转。', functionEn: 'Converts piston reciprocation into crank rotation.',
    keyParameters: ['154 mm center distance', 'I-beam section'], system: 'cranktrain',
  },
  {
    id: 'crankshaft', nameZh: '曲轴与平衡重', nameEn: 'Crankshaft & counterweights',
    materialZh: '锻造合金钢', materialEn: 'Forged alloy steel',
    manufacturingZh: '模锻、感应淬火与磨削', manufacturingEn: 'Forged, induction hardened and ground',
    functionZh: '汇集四缸扭矩并用平衡重减小惯性载荷。', functionEn: 'Combines cylinder torque and counterbalances inertia.',
    keyParameters: ['Stroke 90 mm', 'Five main journals', '180° throw pairs'], system: 'cranktrain',
  },
  {
    id: 'flywheel', nameZh: '飞轮', nameEn: 'Flywheel',
    materialZh: '球墨铸铁', materialEn: 'Ductile cast iron',
    manufacturingZh: '铸造、车削与动平衡', manufacturingEn: 'Cast, turned and dynamically balanced',
    functionZh: '储存转动能量并平滑循环扭矩波动。', functionEn: 'Stores rotational energy and smooths cyclic torque.',
    keyParameters: ['Ring gear', 'High polar inertia'], system: 'cranktrain',
  },
  {
    id: 'camshaft', nameZh: '凸轮轴', nameEn: 'Camshaft',
    materialZh: '冷硬铸铁', materialEn: 'Chilled cast iron',
    manufacturingZh: '铸造、磨削与表面硬化', manufacturingEn: 'Cast, ground and surface hardened',
    functionZh: '以曲轴一半转速驱动进排气门。', functionEn: 'Operates valves at exactly half crankshaft speed.',
    keyParameters: ['2:1 drive ratio', 'DOHC pair'], system: 'valvetrain',
  },
  {
    id: 'intake-valve', nameZh: '进气门', nameEn: 'Intake valve',
    materialZh: '耐热合金钢', materialEn: 'Heat-resistant alloy steel',
    manufacturingZh: '热锻、摩擦焊与磨削', manufacturingEn: 'Hot forged, friction welded and ground',
    functionZh: '按配气相位控制新鲜空气进入气缸。', functionEn: 'Meters fresh air into the cylinder by valve timing.',
    keyParameters: ['Two per cylinder', 'Blue timing cue'], system: 'valvetrain',
  },
  {
    id: 'exhaust-valve', nameZh: '排气门', nameEn: 'Exhaust valve',
    materialZh: '镍基耐热钢', materialEn: 'Nickel-rich heat-resistant steel',
    manufacturingZh: '热锻与阀座面磨削', manufacturingEn: 'Hot forged and seat-face ground',
    functionZh: '将燃烧废气释放到排气歧管。', functionEn: 'Releases combustion gas to the exhaust manifold.',
    keyParameters: ['Two per cylinder', 'High-temperature duty'], system: 'valvetrain',
  },
  {
    id: 'valve-spring', nameZh: '气门弹簧', nameEn: 'Valve spring',
    materialZh: '硅铬弹簧钢', materialEn: 'Silicon-chromium spring steel',
    manufacturingZh: '冷卷、热处理与喷丸', manufacturingEn: 'Cold coiled, heat treated and shot peened',
    functionZh: '使气门可靠回座并保持机构接触。', functionEn: 'Returns the valve to its seat and maintains follower contact.',
    keyParameters: ['Progressive coil', 'Preloaded'], system: 'valvetrain',
  },
  {
    id: 'injector', nameZh: '共轨喷油器', nameEn: 'Common-rail injector',
    materialZh: '工具钢与电磁组件', materialEn: 'Tool steel and solenoid assembly',
    manufacturingZh: '微孔电火花加工与精密装配', manufacturingEn: 'Micro-EDM and precision assembly',
    functionZh: '在压缩终了附近高压雾化喷射燃油。', functionEn: 'Atomizes high-pressure fuel near the end of compression.',
    keyParameters: ['Direct injection', 'Multi-hole nozzle'], system: 'fuel',
  },
  {
    id: 'oil-system', nameZh: '润滑系统', nameEn: 'Lubrication system',
    materialZh: '润滑油 / 铝合金油道', materialEn: 'Engine oil / aluminium galleries',
    manufacturingZh: '铸造油道与钻削主油道', manufacturingEn: 'Cast passages and drilled main gallery',
    functionZh: '向主轴承、连杆轴承与配气机构供油。', functionEn: 'Feeds oil to main, rod and valvetrain bearings.',
    keyParameters: ['Wet sump', 'Pressure-fed bearings'], system: 'lubrication',
  },
  {
    id: 'cooling-system', nameZh: '冷却水套', nameEn: 'Coolant jacket',
    materialZh: '乙二醇冷却液 / 铸造水套', materialEn: 'Glycol coolant / cast jacket',
    manufacturingZh: '砂芯成形内部水道', manufacturingEn: 'Sand-core formed internal passages',
    functionZh: '从缸套与缸盖带走燃烧热量。', functionEn: 'Removes combustion heat from liners and head.',
    keyParameters: ['Cross-flow head', 'Pressurized circuit'], system: 'cooling',
  },
  {
    id: 'intake-manifold', nameZh: '进气歧管', nameEn: 'Intake manifold',
    materialZh: '铝合金', materialEn: 'Aluminium alloy',
    manufacturingZh: '压铸与机加工', manufacturingEn: 'Die cast and machined',
    functionZh: '把增压空气均匀分配到四个气缸。', functionEn: 'Distributes boosted air evenly to four cylinders.',
    keyParameters: ['Four runners', 'Common plenum'], system: 'air',
  },
  {
    id: 'exhaust-manifold', nameZh: '排气歧管', nameEn: 'Exhaust manifold',
    materialZh: '高硅钼球铁', materialEn: 'High-silicon molybdenum iron',
    manufacturingZh: '耐热砂型铸造', manufacturingEn: 'Heat-resistant sand casting',
    functionZh: '汇集各缸排气并驱动涡轮。', functionEn: 'Collects cylinder exhaust and drives the turbine.',
    keyParameters: ['Four branches', 'Turbo feed'], system: 'air',
  },
  {
    id: 'turbocharger', nameZh: '废气涡轮增压器', nameEn: 'Turbocharger',
    materialZh: '镍合金涡轮 / 铝合金压气机', materialEn: 'Nickel turbine / aluminium compressor',
    manufacturingZh: '精密铸造、五轴加工与高速平衡', manufacturingEn: 'Investment cast, five-axis machined and balanced',
    functionZh: '利用排气能量压缩进气，提高充量密度。', functionEn: 'Uses exhaust energy to compress intake air.',
    keyParameters: ['Radial turbine', 'Centrifugal compressor'], system: 'air',
  },
] as const satisfies readonly EnginePartMetadata[];

export const ENGINE_PARTS: ReadonlyMap<string, EnginePartMetadata> = new Map(
  parts.map((part) => [part.id, part]),
);

export function getPartMetadata(partId: string | null): EnginePartMetadata | null {
  if (!partId) return null;
  const genericId = partId.replace(/-\d+$/, '');
  return ENGINE_PARTS.get(partId) ?? ENGINE_PARTS.get(genericId) ?? null;
}
