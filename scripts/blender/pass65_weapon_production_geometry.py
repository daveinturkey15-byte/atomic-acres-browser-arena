"""Platform-specific Pass 65 firearm geometry.

This module deliberately contains no Blender setup or export code.  The main
authoring script passes its deterministic primitive API into ``build_platform``.
Every builder owns a recognisable receiver, feed system, stock, sights and
handling surfaces.  Only the removable magazine and mechanical action are
parented to animated owners; rigid detail is consolidated by the caller.
"""

from __future__ import annotations

import math


class Forge:
    def __init__(self, api, spec, frame, receiver, action, materials, detail, label):
        self.api = api
        self.spec = spec
        self.frame = frame
        self.receiver = receiver
        self.action = action
        self.m = materials
        self.detail = detail
        self.label = label
        self.hero = detail >= 0.75
        self.high = detail >= 0.4
        self.seg = api["segment_count"](detail)

    def empty(self, name, parent=None, semantic=None):
        return self.api["empty"](name, (0, 0, 0), parent or self.frame, semantic)

    def cube(self, name, loc, dims, material, parent=None, rotation=(0, 0, 0), bevel=None):
        if bevel is None:
            bevel = 0.007 if self.high else 0.002
        return self.api["cube"](
            f"{name}_{self.label}", loc, dims, self.m[material], parent or self.frame,
            rotation=rotation, bevel=bevel,
        )

    def prism(self, name, rings, material, parent=None, chamfer=0.16, bevel=None):
        if bevel is None:
            bevel = 0.007 if self.high else 0.002
        return self.api["profiled_prism"](
            f"{name}_{self.label}", rings, self.m[material], parent or self.frame,
            chamfer=chamfer, bevel=bevel, weighted_normals=False,
        )

    def mag_prism(self, name, rings, material, parent, chamfer=0.16, bevel=None):
        if bevel is None:
            bevel = 0.007 if self.high else 0.002
        return self.api["profiled_box_z"](
            f"{name}_{self.label}", rings, self.m[material], parent,
            chamfer=chamfer, bevel=bevel, weighted_normals=False,
        )

    def cylinder(self, name, loc, radius, depth, material, parent=None, rotation=(0, 0, 0), vertices=None, bevel=0.003):
        return self.api["cylinder"](
            f"{name}_{self.label}", loc, radius, depth, self.m[material], parent or self.frame,
            rotation=rotation, vertices=vertices or self.seg, bevel=bevel,
        )

    def between(self, name, start, end, radius, material, parent=None, vertices=None, bevel=0.001):
        return self.api["cylinder_between"](
            f"{name}_{self.label}", start, end, radius, self.m[material], parent or self.frame,
            vertices=vertices or self.seg, bevel=bevel,
        )

    def torus(self, name, loc, major, minor, material, parent=None, rotation=(0, 0, 0), segments=None):
        return self.api["torus"](
            f"{name}_{self.label}", loc, major, minor, self.m[material], parent or self.frame,
            rotation=rotation, segments=segments or self.seg,
        )

    def barrel_y(self, name, start_y, end_y, z, radius, material="metal", parent=None, bevel=0.003):
        return self.cylinder(
            name, (0, (start_y + end_y) * 0.5, z), radius, abs(end_y - start_y),
            material, parent, rotation=(math.pi / 2, 0, 0), bevel=bevel,
        )

    def open_trigger(self, name, center_y, top_z, width, length, parent=None):
        parent = parent or self.frame
        for side in (-1, 1):
            self.between(
                f"{name}_GuardSide{side}",
                (side * width * 0.5, center_y + length * 0.45, top_z),
                (side * width * 0.5, center_y - length * 0.45, top_z - 0.065),
                0.006, "primary", parent, vertices=max(8, self.seg // 2),
            )
        self.between(
            f"{name}_GuardBow",
            (-width * 0.5, center_y - length * 0.45, top_z - 0.065),
            (width * 0.5, center_y - length * 0.45, top_z - 0.065),
            0.006, "primary", parent, vertices=max(8, self.seg // 2),
        )
        self.between(
            f"{name}_Trigger", (0, center_y + 0.01, top_z - 0.008),
            (0, center_y - 0.035, top_z - 0.07), 0.006, "metal", self.action,
            vertices=max(8, self.seg // 2),
        )

    def pistol_grip(self, name, y, top_z, width, length=0.24, angle=-13, material="polymer", parent=None):
        parent = parent or self.frame
        return self.prism(
            name,
            ((y + 0.055, width * 0.82, length * 0.28, top_z - 0.035),
             (y + 0.15, width, length * 0.75, top_z - length * 0.36),
             (y + 0.205, width * 0.88, length * 0.38, top_z - length * 0.78)),
            material, parent, chamfer=0.24,
        )

    def rail(self, name, y0, y1, z, width, parent=None, teeth=None):
        parent = parent or self.frame
        self.cube(f"{name}_Spine", (0, (y0 + y1) * 0.5, z), (width * 0.7, abs(y1 - y0), 0.025), "primary", parent, bevel=0.003)
        count = teeth if teeth is not None else (10 if self.hero else 6 if self.high else 3)
        for index in range(count):
            t = (index + 0.5) / count
            y = y0 + (y1 - y0) * t
            self.cube(f"{name}_Tooth{index}", (0, y, z + 0.018), (width, 0.022, 0.022), "primary", parent, bevel=0.002)

    def simple_mag(self, signature, rings, width_material="metal"):
        magazine = self.empty("weapon-magazine", self.frame, "magazine")
        group = self.empty(signature, magazine, "signature")
        self.mag_prism(signature.replace("-", "_").title(), rings, width_material, group, chamfer=0.18)
        return magazine

    def socket_set(self, *, grip, support, reload, magazine, muzzle, eject, optic, rear_sight, front_sight):
        return {
            "grip-socket-r": (grip, "rightGrip"),
            "support-socket-l": (support, "leftGrip"),
            "reload-socket-l": (reload, "reload"),
            "magazine-socket": (magazine, "magazine"),
            "muzzle-socket": (muzzle, "muzzle"),
            "eject-socket": (eject, "eject"),
            "optic-socket": (optic, "optic"),
            "rear-sight-socket": (rear_sight, "sight-rear"),
            "front-sight-socket": (front_sight, "sight-front"),
        }


def hk416(f: Forge):
    platform = f.empty("hk416-short-stroke-platform-v4", f.frame, "signature")
    f.prism("HK416_ForgedUpper", ((0.25, .15, .105, .065), (.12, .19, .145, .065), (-.24, .18, .13, .065)), "primary", f.receiver, .12)
    f.prism("HK416_Lower", ((.22, .14, .14, -.07), (.02, .19, .17, -.075), (-.2, .16, .13, -.06)), "primary", f.receiver, .14)
    f.prism("HK416_Magwell", ((-.03, .17, .13, -.12), (-.2, .15, .18, -.19), (-.27, .13, .12, -.24)), "primary", f.receiver, .14)
    handguard = f.empty("hk416-quad-rail", platform, "signature")
    f.prism("HK416_HeavyHandguard", ((-.2, .19, .19, .04), (-.48, .22, .205, .045), (-.65, .18, .17, .05)), "polymer", handguard, .12)
    for side in (-1, 1):
        f.cube(f"HK416_SideRail{side}", (side * .116, -.44, .05), (.024, .46, .08), "primary", handguard, bevel=.003)
    f.rail("HK416_MonolithicTopRail", .23, -.66, .173, .22, platform, teeth=14 if f.hero else 8 if f.high else 4)
    piston = f.empty("hk416-piston-block", platform, "signature")
    f.cylinder("HK416_GasRegulator", (0, -.635, .105), .048, .09, "metal", piston, rotation=(math.pi/2,0,0))
    f.barrel_y("HK416_BarrelRear", -.22, -.7, .035, .035, parent=platform)
    f.barrel_y("HK416_BarrelFront", -.7, -.82, .035, .025, parent=platform)
    f.cylinder("HK416_FlashHider", (0, -.85, .035), .034, .075, "primary", platform, rotation=(math.pi/2,0,0))
    if f.high:
        for index in range(5):
            f.cube(f"HK416_HiderSlot{index}", (0, -.873 + index*.011, .065), (.018, .006, .045), "metal", platform, bevel=.001)
    f.cylinder("HK416_Bore", (0, -.89, .035), .014, .008, "rubber", platform, rotation=(math.pi/2,0,0), bevel=0)
    stock = f.empty("weapon-stock", f.frame, "stock")
    stock_sig = f.empty("hk416-telescoping-stock", stock, "signature")
    f.barrel_y("HK416_BufferTube", .22, .58, .045, .032, "metal", stock_sig)
    f.prism("HK416_E1Stock", ((.34,.13,.09,.095),(.5,.18,.15,.05),(.67,.205,.25,-.015)), "polymer", stock_sig, .22)
    f.cube("HK416_ButtPad", (0,.69,-.015), (.22,.045,.27), "rubber", stock_sig, bevel=.018)
    f.pistol_grip("HK416_Grip", .105, -.12, .13, .26)
    f.open_trigger("HK416", -.02, -.12, .13, .14)
    magazine = f.simple_mag("hk416-stanag-magazine", ((-.12,.15,.13,-.09),(-.28,.145,.13,-.10),(-.43,.13,.12,-.12)), "metal")
    optic = f.empty("weapon-optic", f.frame, "optic")
    holo = f.empty("hk416-holographic-optic", optic, "signature")
    f.cube("HK416_HoloBase", (0,-.02,.198), (.16,.14,.04), "primary", holo, bevel=.006)
    f.cube("HK416_HoloWindow", (0,-.03,.275), (.13,.018,.095), "lens", holo, bevel=.008)
    for side in (-1, 1):
        f.cube(f"HK416_HoloHoodSide{side}", (side*.083,-.03,.275), (.025,.055,.145), "primary", holo, bevel=.007)
    f.cube("HK416_HoloHoodTop", (0,-.03,.342), (.19,.055,.025), "primary", holo, bevel=.007)
    f.cube("HK416_HoloHoodBottom", (0,-.03,.21), (.19,.055,.025), "primary", holo, bevel=.007)
    f.cube("HK416_BoltCarrier", (.11,-.02,.075), (.012,.16,.045), "metal", f.action, bevel=.002)
    f.cylinder("HK416_ForwardAssist", (.125,.14,.045), .018,.055,"metal",f.action,rotation=(0,math.pi/2,0))
    return stock, magazine, optic, f.socket_set(
        grip=(0,.13,-.34), support=(-.1,-.48,-.04), reload=(-.1,-.16,-.34), magazine=(0,-.16,-.12),
        muzzle=(0,-.895,.035), eject=(.115,-.02,.075), optic=(0,-.03,.26), rear_sight=(0,.16,.18), front_sight=(0,-.64,.18),
    ), "forged-upper-short-stroke-piston-heavy-quad-rail-e1-stock"


def ak47(f: Forge):
    platform = f.empty("ak47-long-stroke-receiver-v4", f.frame, "signature")
    f.prism("AK47_StampedReceiver", ((.27,.19,.13,.01),(.04,.22,.17,.015),(-.28,.2,.15,.02)), "primary", f.receiver, .08)
    f.prism("AK47_DustCover", ((.24,.15,.09,.13),(.02,.19,.105,.14),(-.27,.16,.09,.135)), "metal", f.receiver, .22)
    f.cube("AK47_ReceiverBottom", (0,.0,-.105), (.2,.48,.08), "primary", f.receiver, bevel=.005)
    gas = f.empty("ak47-gas-tube", platform, "signature")
    f.barrel_y("AK47_Barrel", -.2, -.84, .04, .03, parent=platform)
    f.barrel_y("AK47_GasTube", -.2, -.63, .13, .04, "metal", gas)
    wood = f.empty("ak47-laminate-handguard", platform, "signature")
    f.prism("AK47_UpperHandguard", ((-.18,.13,.075,.135),(-.43,.17,.095,.135),(-.61,.12,.07,.135)), "wood", wood, .26)
    f.prism("AK47_LowerHandguard", ((-.18,.14,.12,.01),(-.42,.2,.15,.0),(-.61,.13,.1,.02)), "wood", wood, .24)
    f.cylinder("AK47_GasBlock", (0,-.64,.085), .052,.07,"primary",platform,rotation=(math.pi/2,0,0))
    f.cylinder("AK47_FrontSightBand", (0,-.735,.055), .045,.06,"primary",platform,rotation=(math.pi/2,0,0))
    for side in (-1,1):
        f.between(f"AK47_FrontSightEar{side}",(side*.035,-.735,.07),(side*.018,-.735,.19),.007,"primary",platform,vertices=10)
    f.cylinder("AK47_FrontSightPost", (0,-.735,.16), .005,.09,"metal",platform,vertices=10)
    f.cylinder("AK47_SlantBrake", (0,-.875,.04), .038,.085,"primary",platform,rotation=(math.pi/2,0,0))
    stock = f.empty("weapon-stock", f.frame, "stock")
    stock_sig = f.empty("ak47-laminate-stock", stock, "signature")
    f.prism("AK47_WoodStock", ((.25,.12,.14,.0),(.47,.18,.2,-.025),(.77,.24,.31,-.06)), "wood", stock_sig, .2)
    f.cube("AK47_ButtPlate", (0,.79,-.06), (.245,.045,.32), "metal", stock_sig, bevel=.014)
    f.prism("AK47_WoodGrip", ((.12,.11,.07,-.1),(.22,.14,.2,-.24),(.27,.13,.12,-.37)), "wood", platform, .24)
    f.open_trigger("AK47", -.01, -.115, .14,.16)
    magazine = f.simple_mag("ak47-curved-magazine", ((-.12,.16,.16,-.1),(-.27,.18,.15,-.11),(-.43,.17,.14,-.145),(-.57,.14,.12,-.22)), "primary")
    mag_sig = f.empty("ak47-curved-magazine", magazine, "signature") if False else None
    tangent = f.empty("weapon-optic", f.frame, "optic")
    f.cube("AK47_TangentBase", (0,-.16,.185), (.105,.19,.025), "primary", tangent, bevel=.004)
    f.cube("AK47_TangentLeaf", (0,-.18,.207), (.07,.15,.015), "metal", tangent, rotation=(math.radians(-4),0,0), bevel=.002)
    f.cylinder("AK47_ChargingHandle", (.145,-.03,.12), .016,.12,"metal",f.action,rotation=(0,math.pi/2,0))
    f.cube("AK47_SelectorLever", (.115,.02,.055), (.015,.28,.024), "metal", f.action, rotation=(0,0,math.radians(-8)), bevel=.003)
    return stock, magazine, tangent, f.socket_set(
        grip=(0,.2,-.35), support=(-.09,-.45,-.05), reload=(-.11,-.13,-.43), magazine=(0,-.12,-.16),
        muzzle=(0,-.925,.04), eject=(.12,-.03,.12), optic=(0,-.16,.21), rear_sight=(0,-.12,.205), front_sight=(0,-.735,.19),
    ), "stamped-receiver-long-stroke-gas-system-laminate-furniture-curved-magazine"


def p90(f: Forge):
    platform = f.empty("p90-bullpup-shell-v4", f.frame, "signature")
    f.prism("P90_UpperShell", ((.44,.27,.18,.04),(.15,.34,.24,.045),(-.2,.34,.25,.045),(-.46,.24,.17,.055)), "polymer", f.receiver, .3)
    f.prism("P90_LowerSpine", ((.34,.25,.10,-.12),(.02,.29,.12,-.13),(-.32,.25,.1,-.11)), "polymer", f.receiver, .3)
    # The rear shell is made from struts so the thumbhole is genuine negative space.
    thumb = f.empty("p90-thumbhole-stock", platform, "signature")
    for side in (-1,1):
        f.between(f"P90_ThumbholeTop{side}",(side*.105,.46,-.01),(side*.12,.18,-.11),.035,"polymer",thumb)
        f.between(f"P90_ThumbholeBottom{side}",(side*.12,.18,-.11),(side*.11,.43,-.25),.035,"polymer",thumb)
    f.cube("P90_ButtPad", (0,.49,-.11), (.28,.055,.32), "rubber", thumb, bevel=.045)
    front = f.empty("p90-forward-grip", platform, "signature")
    f.prism("P90_ForwardGrip", ((-.28,.17,.08,-.09),(-.36,.2,.18,-.2),(-.43,.17,.11,-.31)), "polymer", front, .32)
    f.open_trigger("P90", -.13,-.08,.16,.13,platform)
    f.barrel_y("P90_Barrel", -.4,-.59,.06,.027,"metal",platform)
    f.cylinder("P90_FlashHider", (0,-.62,.06), .038,.075,"primary",platform,rotation=(math.pi/2,0,0))
    magazine = f.empty("weapon-magazine", f.frame, "magazine")
    top = f.empty("p90-top-magazine", magazine, "signature")
    f.cube("P90_TopMagazine", (0,-.02,.205), (.17,.78,.07), "accent", top, bevel=.025)
    f.cube("P90_TransparentChannel", (0,-.04,.242), (.11,.62,.012), "lens", top, bevel=.006)
    # Break up the large polymer shell with the P90's characteristic inset
    # side panels, magazine hardware and ambidextrous controls. These details
    # deliberately use several material responses so the bullpup reads as a
    # manufactured assembly instead of one rounded cuboid.
    for side in (-1,1):
        f.cube(f"P90_ShellCheek{side}",(side*.166,.04,.04),(.025,.5,.14),"primary",platform,rotation=(0,0,side*math.radians(2.5)),bevel=.012)
        f.cube(f"P90_SideInset{side}",(side*.174,-.04,.045),(.014,.42,.115),"rubber",platform,bevel=.006)
        f.cube(f"P90_SideRail{side}",(side*.188,-.29,.095),(.034,.22,.05),"metal",platform,bevel=.005)
        f.cylinder(f"P90_MagazineLatch{side}",(side*.105,.31,.225),.018,.018,"metal",top,rotation=(0,math.pi/2,0),vertices=max(10,f.seg//2),bevel=.001)
        if f.high:
            for index,y in enumerate((.27,.13,-.01,-.15,-.29)):
                f.cylinder(f"P90_ShellFastener{side}_{index}",(side*.184,y,.088),.007,.012,"metal",platform,rotation=(0,math.pi/2,0),vertices=8,bevel=0)
    if f.high:
        # Brass/amber cartridge hints under the translucent top-feed channel.
        # They are sparse enough to survive batching without becoming a draw
        # call or triangle-count problem.
        for index in range(7 if f.hero else 4):
            y=.22-index*(.44/(6 if f.hero else 3))
            f.cylinder(f"P90_TopRound{index}",(0,y,.247),.011,.105,"accent",top,rotation=(0,math.pi/2,0),vertices=max(8,f.seg//2),bevel=0)
        f.cube("P90_MagazineFeedBlock",(0,-.335,.218),(.155,.075,.085),"metal",top,bevel=.01)
        f.cube("P90_BottomEjectionChute",(0,-.02,-.185),(.1,.13,.025),"rubber",platform,bevel=.006)
    optic = f.empty("weapon-optic", f.frame, "optic")
    ring = f.empty("p90-ring-sight", optic, "signature")
    f.cube("P90_SightBridge", (0,-.18,.28), (.17,.11,.04), "primary", ring, bevel=.008)
    f.torus("P90_RingSight", (0,-.18,.335), .035,.008,"metal",ring,rotation=(math.pi/2,0,0))
    f.cube("P90_Bolt", (.145,-.12,.075), (.02,.16,.055), "metal", f.action, bevel=.003)
    f.cylinder("P90_ChargingTab", (-.19,-.15,.02), .017,.08,"metal",f.action,rotation=(0,math.pi/2,0))
    return thumb, magazine, optic, f.socket_set(
        grip=(0,.2,-.25), support=(-.13,-.35,-.22), reload=(-.12,.05,.2), magazine=(0,-.02,.205),
        muzzle=(0,-.665,.06), eject=(.16,-.1,-.02), optic=(0,-.18,.33), rear_sight=(0,-.1,.33), front_sight=(0,-.35,.33),
    ), "compact-bullpup-polymer-shell-top-feed-magazine-thumbhole-forward-grip"


def mp5(f: Forge):
    platform = f.empty("mp5-roller-delayed-platform-v4", f.frame, "signature")
    tube = f.empty("mp5-tubular-receiver", platform, "signature")
    f.cylinder("MP5_ReceiverTube", (0,.0,.07), .1,.56,"primary",tube,rotation=(math.pi/2,0,0))
    f.cube("MP5_LowerReceiver", (0,.06,-.075), (.18,.39,.16), "polymer", f.receiver, bevel=.018)
    f.prism("MP5_SlimHandguard", ((-.23,.17,.13,.0),(-.42,.2,.16,.0),(-.58,.15,.12,.02)), "polymer", platform, .3)
    if f.high:
        for side in (-1,1):
            for index in range(3):
                f.cube(f"MP5_HandguardGroove{side}_{index}",(side*.094,-.34-index*.065,.0),(.012,.025,.11),"metal",platform,bevel=.001)
    f.barrel_y("MP5_Barrel", -.48,-.66,.06,.028,"metal",platform)
    f.cylinder("MP5_ThreeLug", (0,-.69,.06), .038,.09,"primary",platform,rotation=(math.pi/2,0,0))
    for angle in (0,math.tau/3,2*math.tau/3):
        f.cylinder("MP5_Lug", (math.cos(angle)*.04,-.7,.06+math.sin(angle)*.04), .009,.035,"metal",platform,rotation=(math.pi/2,0,0),vertices=8)
    stock = f.empty("weapon-stock",f.frame,"stock")
    stock_sig = f.empty("mp5-collapsing-stock",stock,"signature")
    for side in (-1,1):
        f.between(f"MP5_StockRail{side}",(side*.075,.21,.04),(side*.105,.68,-.01),.012,"metal",stock_sig)
    f.cube("MP5_ButtPad",(0,.7,-.01),(.22,.055,.25),"rubber",stock_sig,bevel=.028)
    f.prism("MP5_GripFrame",((.12,.13,.1,-.08),(.21,.15,.22,-.25),(.25,.13,.12,-.38)),"polymer",platform,.28)
    f.open_trigger("MP5", -.04,-.1,.14,.15,platform)
    magazine = f.simple_mag("mp5-curved-magazine", ((-.09,.13,.11,-.03),(-.24,.14,.115,-.05),(-.4,.13,.105,-.1),(-.52,.11,.09,-.17)), "primary")
    optic = f.empty("weapon-optic",f.frame,"optic")
    diopter = f.empty("mp5-diopter-sight",optic,"signature")
    f.cube("MP5_RearSightBase",(0,.18,.175),(.12,.07,.04),"primary",diopter,bevel=.005)
    f.torus("MP5_RearDiopter",(0,.18,.23),.035,.008,"metal",diopter,rotation=(math.pi/2,0,0))
    f.cylinder("MP5_FrontSightBand",(0,-.52,.07),.052,.05,"primary",diopter,rotation=(math.pi/2,0,0))
    for side in (-1,1):
        f.between(f"MP5_FrontSightEar{side}",(side*.035,-.52,.095),(side*.038,-.52,.225),.008,"primary",diopter,vertices=10)
    f.torus("MP5_FrontSightRing",(0,-.52,.235),.042,.009,"metal",diopter,rotation=(math.pi/2,0,0))
    f.cube("MP5_Bolt",(.105,-.03,.08),(.012,.15,.04),"metal",f.action,bevel=.002)
    f.between("MP5_CockingLever",(-.08,-.36,.11),(-.18,-.31,.13),.012,"metal",f.action,vertices=10)
    return stock, magazine, optic, f.socket_set(
        grip=(0,.19,-.36),support=(-.1,-.39,-.05),reload=(-.1,-.1,-.39),magazine=(0,-.08,-.1),
        muzzle=(0,-.75,.06),eject=(.11,-.04,.08),optic=(0,.03,.22),rear_sight=(0,.18,.23),front_sight=(0,-.52,.235),
    ), "roller-delayed-tubular-receiver-slim-handguard-curved-magazine-diopter"


def mini_uzi(f: Forge):
    platform = f.empty("mini-uzi-stamped-platform-v4", f.frame, "signature")
    stamped = f.empty("mini-uzi-stamped-receiver",platform,"signature")
    f.prism("MiniUzi_StampedReceiver",((.24,.2,.24,.02),(-.02,.23,.27,.02),(-.3,.2,.22,.03)),"primary",stamped,.08)
    f.cube("MiniUzi_TopCover",(0,-.02,.175),(.18,.48,.055),"metal",stamped,bevel=.008)
    if f.high:
        for index in range(4):
            f.cube(f"MiniUzi_StampRib{index}",(.112,.12-index*.1,.025),(.008,.022,.16),"metal",stamped,bevel=.001)
        f.cube("MiniUzi_EjectionPort",(.118,-.12,.105),(.012,.16,.085),"rubber",stamped,bevel=.004)
        f.cube("MiniUzi_BoltFace",(.124,-.13,.105),(.008,.09,.055),"metal",f.action,bevel=.002)
        f.cube("MiniUzi_Selector",(.121,.12,-.04),(.018,.085,.035),"accent",stamped,rotation=(0,0,math.radians(-8)),bevel=.004)
        f.cylinder("MiniUzi_MagRelease",(.095,.19,-.23),.017,.018,"metal",platform,rotation=(0,math.pi/2,0),vertices=10,bevel=.001)
        for side in (-1,1):
            for index in range(3 if f.hero else 2):
                f.cube(f"MiniUzi_ForegripRib{side}_{index}",(side*.104,-.285-index*.042,-.035),(.018,.022,.12),"rubber",platform,bevel=.002)
    f.barrel_y("MiniUzi_Barrel",-.25,-.48,.04,.032,"metal",platform)
    f.cylinder("MiniUzi_BarrelNut",(0,-.38,.04),.06,.07,"primary",platform,rotation=(math.pi/2,0,0))
    f.cylinder("MiniUzi_Muzzle",(0,-.51,.04),.04,.06,"primary",platform,rotation=(math.pi/2,0,0))
    if f.high:
        for index in range(3):
            f.torus(f"MiniUzi_BarrelNutGroove{index}",(0,-.36-index*.018,.04),.061,.004,"metal",platform,rotation=(math.pi/2,0,0),segments=max(12,f.seg))
    f.prism("MiniUzi_GripHousing",((.11,.15,.12,-.1),(.19,.17,.25,-.27),(.23,.15,.12,-.44)),"polymer",platform,.18)
    f.open_trigger("MiniUzi",-.05,-.105,.135,.14,platform)
    magazine = f.empty("weapon-magazine",f.frame,"magazine")
    mag_sig = f.empty("mini-uzi-grip-magazine",magazine,"signature")
    f.mag_prism("MiniUzi_GripMagazine",((-.13,.105,.1,.13),(-.32,.1,.095,.15),(-.5,.09,.085,.18)),"metal",mag_sig,.12)
    stock = f.empty("weapon-stock",f.frame,"stock")
    rods = f.empty("mini-uzi-stock-rods",stock,"signature")
    for side in (-1,1):
        f.between(f"MiniUzi_StockRodTop{side}",(side*.08,.22,.12),(side*.12,.62,.03),.011,"metal",rods)
        f.between(f"MiniUzi_StockRodBottom{side}",(side*.12,.62,.03),(side*.08,.22,-.08),.011,"metal",rods)
        f.cylinder(f"MiniUzi_StockHinge{side}",(side*.105,.215,.02),.029,.025,"primary",rods,rotation=(0,math.pi/2,0),vertices=max(10,f.seg),bevel=.002)
    f.cube("MiniUzi_ShoulderPlate",(0,.64,.025),(.24,.045,.18),"rubber",rods,bevel=.025)
    optic = f.empty("weapon-optic",f.frame,"optic")
    f.cube("MiniUzi_RearSight",(0,.17,.23),(.11,.05,.08),"primary",optic,bevel=.006)
    f.cube("MiniUzi_FrontSight",(0,-.31,.22),(.08,.045,.09),"primary",optic,bevel=.006)
    for side in (-1,1):
        f.between(f"MiniUzi_RearSightEar{side}",(side*.055,.18,.185),(side*.055,.18,.26),.009,"primary",optic,vertices=max(8,f.seg//2))
        f.between(f"MiniUzi_FrontSightEar{side}",(side*.048,-.31,.17),(side*.048,-.31,.265),.009,"primary",optic,vertices=max(8,f.seg//2))
    handle = f.empty("mini-uzi-side-charging-handle",f.action,"signature")
    f.cylinder("MiniUzi_ChargingKnob",(.14,-.08,.18),.02,.11,"metal",handle,rotation=(0,math.pi/2,0))
    return stock, magazine, optic, f.socket_set(
        grip=(0,.18,-.23),support=(-.12,-.28,-.04),reload=(-.1,.15,-.42),magazine=(0,.15,-.2),
        muzzle=(0,-.56,.04),eject=(.12,-.04,.1),optic=(0,-.02,.23),rear_sight=(0,.17,.23),front_sight=(0,-.31,.22),
    ), "compact-stamped-receiver-grip-feed-magazine-wire-stock-barrel-nut"


def m249(f: Forge):
    platform = f.empty("m249-belt-fed-platform-v4", f.frame, "signature")
    f.prism("M249_Receiver", ((.34,.25,.2,.01),(.05,.3,.25,.01),(-.34,.25,.2,.02)), "primary", f.receiver, .1)
    f.cube("M249_FeedCover", (0,-.02,.185), (.29,.5,.075), "metal", f.receiver, bevel=.012)
    f.prism("M249_HeatShield", ((-.28,.2,.16,.04),(-.55,.24,.19,.05),(-.75,.18,.14,.06)), "polymer", platform, .16)
    if f.high:
        for side in (-1,1):
            for index in range(4):
                f.cube(f"M249_ShieldVent{side}_{index}",(side*.125,-.39-index*.07,.055),(.012,.035,.09),"metal",platform,bevel=.001)
    f.barrel_y("M249_HeavyBarrel",-.28,-1.0,.07,.039,"metal",platform)
    f.cylinder("M249_GasBlock",(0,-.72,.035),.065,.12,"primary",platform,rotation=(math.pi/2,0,0))
    f.cylinder("M249_FlashHider",(0,-1.04,.07),.047,.1,"primary",platform,rotation=(math.pi/2,0,0))
    stock = f.empty("weapon-stock",f.frame,"stock")
    f.prism("M249_FixedStock",((.3,.18,.17,.02),(.52,.24,.25,-.02),(.83,.29,.34,-.07)),"polymer",stock,.22)
    f.cube("M249_ButtPad",(0,.85,-.07),(.3,.05,.35),"rubber",stock,bevel=.025)
    f.pistol_grip("M249_Grip",.17,-.13,.16,.28)
    f.open_trigger("M249",.02,-.13,.16,.17)
    magazine = f.empty("weapon-magazine",f.frame,"magazine")
    box = f.empty("m249-box-magazine",magazine,"signature")
    f.cube("M249_AmmoBox",(-.02,-.06,-.31),(.34,.37,.38),"polymer",box,bevel=.026)
    f.cube("M249_BoxLatch",(.18,-.02,-.17),(.03,.12,.08),"accent",box,bevel=.004)
    if f.hero:
        for index in range(5):
            f.cylinder(f"M249_BeltLink{index}",(.13,-.2+index*.05,.11),.015,.055,"accent",platform,rotation=(0,math.pi/2,0),vertices=10)
    handle = f.empty("m249-carry-handle",platform,"signature")
    f.between("M249_CarryStemL",(-.1,-.18,.2),(-.12,-.08,.42),.015,"primary",handle)
    f.between("M249_CarryStemR",(.1,-.18,.2),(.12,-.08,.42),.015,"primary",handle)
    f.cube("M249_CarryBar",(0,-.08,.42),(.26,.17,.04),"polymer",handle,bevel=.015)
    bipod = f.empty("m249-bipod",platform,"signature")
    for side in (-1,1):
        f.between(f"M249_BipodLeg{side}",(side*.06,-.73,.01),(side*.25,-.72,-.4),.014,"metal",bipod)
        f.cube(f"M249_BipodFoot{side}",(side*.27,-.72,-.41),(.11,.07,.025),"rubber",bipod,bevel=.006)
    optic = f.empty("weapon-optic",f.frame,"optic")
    f.cube("M249_RearApertureBase",(0,.2,.27),(.15,.07,.05),"primary",optic,bevel=.006)
    f.torus("M249_RearAperture",(0,.2,.33),.028,.007,"metal",optic,rotation=(math.pi/2,0,0))
    f.cylinder("M249_FrontSightBand",(0,-.86,.07),.052,.05,"primary",optic,rotation=(math.pi/2,0,0))
    for side in (-1,1):
        f.between(f"M249_FrontSightEar{side}",(side*.035,-.86,.09),(side*.02,-.86,.31),.007,"primary",optic,vertices=10)
    f.cube("M249_FrontPost",(0,-.86,.24),(.025,.025,.14),"metal",optic,bevel=.003)
    f.cube("M249_BoltCarrier",(.17,-.02,.1),(.018,.22,.07),"metal",f.action,bevel=.003)
    return stock, magazine, optic, f.socket_set(
        grip=(0,.21,-.4),support=(-.13,-.48,-.08),reload=(-.2,-.03,-.34),magazine=(0,-.06,-.25),
        muzzle=(0,-1.1,.07),eject=(.17,-.08,.1),optic=(0,-.1,.31),rear_sight=(0,.2,.33),front_sight=(0,-.86,.33),
    ), "belt-fed-top-cover-heavy-barrel-box-feed-carry-handle-deployed-bipod"


def remington870(f: Forge):
    platform = f.empty("remington870-pump-platform-v4",f.frame,"signature")
    f.prism("R870_Receiver",((.27,.19,.17,.02),(.03,.22,.2,.02),(-.23,.19,.16,.03)),"primary",f.receiver,.12)
    f.barrel_y("R870_Barrel",-.19,-.92,.11,.048,"metal",platform)
    tube = f.empty("remington870-tube-magazine",platform,"signature")
    f.barrel_y("R870_Tube",-.18,-.82,-.02,.035,"metal",tube)
    f.cylinder("R870_MuzzleRing",(0,-.84,-.02),.048,.04,"primary",tube,rotation=(math.pi/2,0,0))
    pump = f.empty("remington870-pump",f.action,"signature")
    f.cylinder("R870_ForeEnd",(0,-.52,-.015),.09,.34,"polymer",pump,rotation=(math.pi/2,0,0),bevel=.008)
    if f.high:
        for index in range(6):
            f.torus(f"R870_PumpRib{index}",(0,-.39-index*.052,-.015),.091,.007,"polymer",pump,rotation=(math.pi/2,0,0),segments=max(12,f.seg))
    stock = f.empty("weapon-stock",f.frame,"stock")
    f.prism("R870_ClassicStock",((.23,.13,.14,.0),(.48,.2,.22,-.03),(.77,.25,.31,-.08)),"polymer",stock,.22)
    f.cube("R870_ButtPad",(0,.79,-.08),(.26,.055,.32),"rubber",stock,bevel=.024)
    f.open_trigger("R870",.0,-.13,.15,.16)
    magazine = f.empty("weapon-magazine",f.frame,"magazine")
    f.cylinder("R870_ReloadShell",(-.09,.05,-.17),.022,.09,"accent",magazine,rotation=(math.pi/2,0,0),vertices=max(10,f.seg//2))
    saddle = f.empty("remington870-shell-saddle",platform,"signature")
    for index in range(5 if f.hero else 3 if f.high else 2):
        f.cylinder(f"R870_SaddleShell{index}",(.125,.13-index*.065,.02),.022,.085,"accent",saddle,rotation=(math.pi/2,0,0),vertices=max(10,f.seg//2))
    optic = f.empty("weapon-optic",f.frame,"optic")
    f.cylinder("R870_Bead",(0,-.82,.175),.009,.025,"accent",optic,vertices=8)
    f.cube("R870_Extractor",(.115,-.03,.07),(.012,.12,.04),"metal",f.action,bevel=.002)
    return stock, magazine, optic, f.socket_set(
        grip=(0,.31,-.17),support=(-.09,-.52,-.05),reload=(-.11,.04,-.18),magazine=(0,.04,-.15),
        muzzle=(0,-.97,.11),eject=(.12,-.03,.07),optic=(0,-.45,.17),rear_sight=(0,.18,.17),front_sight=(0,-.82,.175),
    ), "pump-action-receiver-dual-tube-fore-end-classic-stock-shell-saddle"


def m40a5(f: Forge):
    platform=f.empty("m40a5-precision-platform-v4",f.frame,"signature")
    f.cylinder("M40A5_Action",(0,.0,.08),.09,.55,"primary",f.receiver,rotation=(math.pi/2,0,0))
    f.prism("M40A5_BeddedChassis",((.35,.18,.16,-.05),(.02,.24,.21,-.09),(-.38,.18,.15,-.05)),"polymer",f.receiver,.28)
    f.barrel_y("M40A5_HeavyBarrel",-.25,-1.02,.09,.033,"metal",platform)
    f.cylinder("M40A5_Crown",(0,-1.05,.09),.04,.06,"primary",platform,rotation=(math.pi/2,0,0))
    stock=f.empty("weapon-stock",f.frame,"stock")
    f.prism("M40A5_PrecisionStock",((.28,.17,.16,-.03),(.55,.23,.25,-.06),(.87,.27,.35,-.11)),"polymer",stock,.25)
    cheek=f.empty("m40a5-cheek-riser",stock,"signature")
    f.cube("M40A5_CheekRiser",(0,.53,.1),(.23,.35,.11),"accent",cheek,bevel=.022)
    f.cube("M40A5_ButtPad",(0,.9,-.1),(.28,.055,.37),"rubber",stock,bevel=.026)
    f.open_trigger("M40A5",.02,-.13,.14,.16)
    f.prism("M40A5_Grip",((.16,.12,.09,-.11),(.26,.15,.21,-.27),(.31,.13,.12,-.4)),"polymer",platform,.26)
    magazine=f.simple_mag("m40a5-short-box-magazine",((-.11,.14,.13,-.04),(-.31,.13,.12,-.055)),"primary")
    optic=f.empty("weapon-optic",f.frame,"optic")
    scope=f.empty("m40a5-long-scope",optic,"signature")
    f.cylinder("M40A5_ScopeTube",(0,-.08,.29),.045,.6,"primary",scope,rotation=(math.pi/2,0,0))
    f.cylinder("M40A5_Objective",(0,-.39,.29),.072,.12,"primary",scope,rotation=(math.pi/2,0,0))
    f.cylinder("M40A5_Ocular",(0,.24,.29),.06,.14,"primary",scope,rotation=(math.pi/2,0,0))
    f.cylinder("M40A5_Lens",(0,-.455,.29),.061,.008,"lens",scope,rotation=(math.pi/2,0,0),bevel=0)
    for y in (-.22,.1):
        f.torus("M40A5_ScopeRing",(0,y,.29),.053,.009,"metal",scope,rotation=(math.pi/2,0,0))
        f.cube("M40A5_ScopeMount",(0,y,.205),(.12,.04,.1),"metal",scope,bevel=.005)
    handle=f.empty("m40a5-bolt-handle",f.action,"signature")
    f.cylinder("M40A5_BoltBody",(.11,.06,.09),.018,.2,"metal",handle,rotation=(0,math.pi/2,0))
    f.between("M40A5_BoltStem",(.13,.08,.09),(.22,.13,.02),.014,"metal",handle)
    f.cylinder("M40A5_BoltKnob",(.23,.14,.01),.027,.04,"metal",handle,rotation=(0,math.pi/2,0))
    if f.high:
        bipod=f.empty("m40a5-bipod",platform,"bipod")
        for side in (-1,1): f.between(f"M40A5_BipodLeg{side}",(side*.05,-.72,.01),(side*.22,-.74,-.38),.012,"metal",bipod)
    return stock,magazine,optic,f.socket_set(
        grip=(0,.26,-.38),support=(-.1,-.5,-.08),reload=(-.11,-.02,-.31),magazine=(0,-.04,-.14),
        muzzle=(0,-1.1,.09),eject=(.12,.02,.09),optic=(0,-.08,.29),rear_sight=(0,.22,.29),front_sight=(0,-.43,.29),
    ),"precision-bedded-chassis-heavy-barrel-bolt-handle-long-scope-cheek-riser"


def railgun(f: Forge):
    platform=f.empty("emrg-twin-rail-platform-v4",f.frame,"signature")
    f.prism("EMRG_CentralChassis",((.4,.28,.21,.0),(.08,.37,.27,.01),(-.42,.34,.24,.02),(-.72,.24,.16,.04)),"primary",f.receiver,.14)
    f.prism("EMRG_InsulatedLower",((.25,.2,.11,-.14),(-.1,.28,.15,-.18),(-.47,.2,.1,-.13)),"polymer",platform,.24)
    for side,name in ((-1,"emrg-coil-left"),(1,"emrg-coil-right")):
        coil=f.empty(name,f.action,"signature")
        f.barrel_y(f"EMRG_Rail{side}",-.25,-1.05,.08,.038,"emissive",coil)
        for index in range(7 if f.hero else 5 if f.high else 3):
            f.torus(f"EMRG_CoilRing{side}_{index}",(side*.145,-.3-index*.105,.08),.065,.011,"emissive",coil,rotation=(math.pi/2,0,0))
            f.between(f"EMRG_CoilBridge{side}_{index}",(0,-.3-index*.105,.02),(side*.145,-.3-index*.105,.08),.012,"emissive",coil)
    f.cube("EMRG_RailShroudL",(-.15,-.68,.08),(.075,.84,.11),"primary",platform,bevel=.018)
    f.cube("EMRG_RailShroudR",(.15,-.68,.08),(.075,.84,.11),"primary",platform,bevel=.018)
    f.cylinder("EMRG_Emitter",(0,-1.12,.08),.075,.12,"primary",platform,rotation=(math.pi/2,0,0))
    f.cylinder("EMRG_EmitterCore",(0,-1.185,.08),.038,.01,"emissive",platform,rotation=(math.pi/2,0,0),bevel=0)
    magazine=f.empty("weapon-magazine",f.frame,"magazine")
    bank=f.empty("emrg-capacitor-bank",magazine,"signature")
    f.cube("EMRG_CapacitorCassette",(0,.0,-.31),(.28,.33,.3),"polymer",bank,bevel=.028)
    for index in range(4 if f.high else 2):
        f.cylinder(f"EMRG_CapCell{index}",(-.09+index*.06,-.02,-.31),.022,.25,"polymer",bank,vertices=max(10,f.seg//2))
    stock=f.empty("weapon-stock",f.frame,"stock")
    for side in (-1,1):
        f.between(f"EMRG_StockUpper{side}",(side*.11,.32,.08),(side*.18,.82,.04),.016,"metal",stock)
        f.between(f"EMRG_StockLower{side}",(side*.18,.82,.04),(side*.11,.35,-.16),.016,"metal",stock)
    f.cube("EMRG_ButtPad",(0,.85,-.04),(.38,.06,.32),"rubber",stock,bevel=.03)
    f.pistol_grip("EMRG_Grip",.2,-.15,.17,.29)
    f.open_trigger("EMRG",.03,-.15,.16,.17)
    optic=f.empty("weapon-optic",f.frame,"optic")
    thermal=f.empty("emrg-thermal-optic",optic,"signature")
    f.cube("EMRG_ThermalHousing",(0,-.03,.34),(.25,.3,.14),"primary",thermal,bevel=.025)
    f.cube("EMRG_ThermalWindow",(0,-.19,.34),(.17,.012,.08),"lens",thermal,bevel=.008)
    f.rail("EMRG_DorsalRail",.34,-.75,.23,.28,platform,teeth=10 if f.hero else 6 if f.high else 3)
    return stock,magazine,optic,f.socket_set(
        grip=(0,.25,-.43),support=(-.18,-.58,-.08),reload=(-.16,.02,-.33),magazine=(0,0,-.26),
        muzzle=(0,-1.195,.08),eject=(.2,.02,.02),optic=(0,-.04,.34),rear_sight=(0,.2,.28),front_sight=(0,-.75,.28),
    ),"twin-electromagnetic-rails-coil-bridges-capacitor-cassette-thermal-optic"


def m134(f: Forge):
    platform=f.empty("m134-rotary-platform-v4",f.frame,"signature")
    housing=f.empty("m134-drive-motor",platform,"signature")
    f.cylinder("M134_DriveHousing",(0,.05,.05),.2,.48,"primary",housing,rotation=(math.pi/2,0,0))
    f.cylinder("M134_RearMotor",(0,.32,.05),.17,.22,"metal",housing,rotation=(math.pi/2,0,0))
    cluster=f.empty("m134-barrel-cluster",f.action,"signature")
    for index in range(6):
        angle=index*math.tau/6
        x=math.cos(angle)*.105; z=.05+math.sin(angle)*.105
        f.barrel_y(f"M134_Barrel{index}",-.12,-1.14,z,.026,"metal",cluster)
    for y in (-.25,-.72,-1.03):
        f.torus("M134_BarrelCollar",(0,y,.05),.145,.025,"primary",cluster,rotation=(math.pi/2,0,0),segments=max(12,f.seg))
    f.cylinder("M134_MuzzleHub",(0,-1.17,.05),.15,.08,"primary",cluster,rotation=(math.pi/2,0,0))
    frame=f.empty("m134-carry-frame",platform,"signature")
    for side in (-1,1):
        f.between(f"M134_FrameTop{side}",(side*.18,.25,.23),(side*.24,-.52,.28),.025,"primary",frame)
        f.between(f"M134_FrameBottom{side}",(side*.2,.2,-.15),(side*.24,-.52,-.17),.025,"primary",frame)
        f.between(f"M134_Handle{side}",(side*.27,.1,-.02),(side*.38,-.1,-.18),.024,"polymer",frame)
    f.between("M134_CarryBridge",(-.18,.26,.23),(.18,.26,.23),.025,"polymer",frame)
    magazine=f.empty("weapon-magazine",f.frame,"magazine")
    drum=f.empty("m134-ammo-drum",magazine,"signature")
    f.cylinder("M134_AmmoDrum",(.28,.13,-.25),.22,.34,"polymer",drum,rotation=(0,math.pi/2,0))
    f.torus("M134_DrumRim",(.46,.13,-.25),.18,.018,"metal",drum,rotation=(0,math.pi/2,0))
    if f.high:
        for index in range(6):
            angle=index*math.tau/6
            f.between(f"M134_DrumRib{index}",(.465,.13,-.25),(.465,.13+math.cos(angle)*.17,-.25+math.sin(angle)*.17),.007,"metal",drum,vertices=8)
    stock=f.empty("weapon-stock",f.frame,"stock")
    f.cube("M134_ShoulderYoke",(0,.55,.02),(.36,.42,.22),"polymer",stock,bevel=.05)
    optic=f.empty("weapon-optic",f.frame,"optic")
    f.cube("M134_ReflexBase",(0,-.05,.265),(.17,.12,.04),"primary",optic,bevel=.006)
    f.cube("M134_ReflexWindow",(0,-.08,.335),(.14,.03,.11),"lens",optic,bevel=.012)
    return stock,magazine,optic,f.socket_set(
        grip=(.28,-.05,-.2),support=(-.28,-.2,-.14),reload=(.25,.15,-.3),magazine=(.28,.13,-.25),
        muzzle=(0,-1.23,.05),eject=(.23,.1,.0),optic=(0,-.08,.38),rear_sight=(0,.12,.34),front_sight=(0,-.55,.34),
    ),"six-barrel-rotary-cluster-drive-motor-carry-frame-side-ammo-drum"


def m14_ebr(f: Forge):
    platform=f.empty("m14ebr-sage-platform-v4",f.frame,"signature")
    chassis=f.empty("m14ebr-sage-chassis",platform,"signature")
    f.prism("M14EBR_Action",((.32,.18,.14,.04),(.03,.24,.19,.04),(-.4,.2,.15,.05)),"primary",chassis,.12)
    f.prism("M14EBR_ChassisLower",((.28,.18,.12,-.11),(-.05,.27,.17,-.13),(-.45,.2,.11,-.09)),"polymer",chassis,.22)
    f.prism("M14EBR_Handguard",((-.35,.2,.17,.03),(-.62,.25,.2,.04),(-.82,.17,.13,.06)),"primary",chassis,.14)
    f.barrel_y("M14EBR_Barrel",-.35,-1.02,.08,.034,"metal",platform)
    f.cylinder("M14EBR_GasBlock",(0,-.71,.02),.052,.12,"primary",platform,rotation=(math.pi/2,0,0))
    f.cylinder("M14EBR_FlashHider",(0,-1.06,.08),.043,.1,"primary",platform,rotation=(math.pi/2,0,0))
    f.rail("M14EBR_TopRail",.26,-.8,.22,.24,platform,teeth=14 if f.hero else 8 if f.high else 4)
    stock=f.empty("weapon-stock",f.frame,"stock")
    skel=f.empty("m14ebr-skeletal-stock",stock,"signature")
    f.barrel_y("M14EBR_StockTube",.25,.72,.04,.032,"metal",skel)
    for side in (-1,1): f.between(f"M14EBR_StockBrace{side}",(side*.07,.42,.06),(side*.13,.78,-.1),.014,"metal",skel)
    f.cube("M14EBR_CheekRest",(0,.55,.1),(.22,.32,.09),"polymer",skel,bevel=.02)
    f.cube("M14EBR_ButtPad",(0,.81,-.04),(.28,.055,.34),"rubber",skel,bevel=.025)
    f.pistol_grip("M14EBR_Grip",.17,-.13,.15,.28)
    f.open_trigger("M14EBR",.01,-.13,.15,.16)
    magazine=f.simple_mag("m14ebr-box-magazine",((-.1,.19,.16,-.05),(-.38,.175,.15,-.08)),"primary")
    optic=f.empty("weapon-optic",f.frame,"optic")
    thermal=f.empty("m14ebr-thermal-optic",optic,"signature")
    f.cylinder("M14EBR_Scope",(0,-.04,.33),.05,.52,"primary",thermal,rotation=(math.pi/2,0,0))
    f.cylinder("M14EBR_Objective",(0,-.31,.33),.072,.1,"primary",thermal,rotation=(math.pi/2,0,0))
    f.cylinder("M14EBR_Lens",(0,-.365,.33),.06,.008,"lens",thermal,rotation=(math.pi/2,0,0),bevel=0)
    for y in (-.2,.12):
        f.cube("M14EBR_ScopeMount",(0,y,.265),(.13,.045,.11),"metal",thermal,bevel=.005)
    f.cube("M14EBR_OpRod",(.125,-.08,.08),(.018,.4,.05),"metal",f.action,bevel=.003)
    f.cylinder("M14EBR_ChargingHandle",(.16,.02,.06),.018,.1,"metal",f.action,rotation=(0,math.pi/2,0))
    return stock,magazine,optic,f.socket_set(
        grip=(0,.22,-.4),support=(-.12,-.55,-.07),reload=(-.12,-.03,-.32),magazine=(0,-.05,-.15),
        muzzle=(0,-1.12,.08),eject=(.14,-.05,.1),optic=(0,-.04,.33),rear_sight=(0,.2,.27),front_sight=(0,-.8,.27),
    ),"sage-ebr-chassis-op-rod-box-magazine-skeletal-stock-long-optic-rail"


def benelli_m4(f: Forge):
    platform=f.empty("benelli-m4-gas-platform-v4",f.frame,"signature")
    f.prism("BenelliM4_Receiver",((.28,.19,.16,.02),(.03,.23,.2,.02),(-.26,.2,.16,.03)),"primary",f.receiver,.12)
    f.prism("BenelliM4_ForeEnd",((-.2,.17,.14,.0),(-.48,.22,.18,.0),(-.72,.16,.13,.02)),"polymer",platform,.28)
    f.barrel_y("BenelliM4_Barrel",-.2,-.94,.1,.046,"metal",platform)
    tube=f.empty("benelli-m4-tube-magazine",platform,"signature")
    f.barrel_y("BenelliM4_MagTube",-.16,-.83,-.02,.034,"metal",tube)
    pistons=f.empty("benelli-m4-gas-pistons",f.action,"signature")
    for side in (-1,1): f.barrel_y(f"BenelliM4_Piston{side}",-.24,-.57,-.015,.019,"accent",pistons)
    f.cylinder("BenelliM4_Choke",(0,-.98,.1),.052,.07,"primary",platform,rotation=(math.pi/2,0,0))
    stock=f.empty("weapon-stock",f.frame,"stock")
    f.prism("BenelliM4_Stock",((.24,.14,.14,.0),(.48,.2,.22,-.03),(.76,.24,.31,-.08)),"polymer",stock,.24)
    f.cube("BenelliM4_ButtPad",(0,.78,-.08),(.25,.055,.32),"rubber",stock,bevel=.025)
    f.pistol_grip("BenelliM4_Grip",.18,-.12,.14,.27)
    f.open_trigger("BenelliM4",.0,-.12,.14,.16)
    magazine=f.empty("weapon-magazine",f.frame,"magazine")
    f.cylinder("BenelliM4_ReloadShell",(-.1,.04,-.17),.022,.09,"accent",magazine,rotation=(math.pi/2,0,0),vertices=max(10,f.seg//2))
    saddle=f.empty("benelli-m4-shell-saddle",platform,"signature")
    for index in range(4 if f.hero else 3 if f.high else 2): f.cylinder(f"BenelliM4_SaddleShell{index}",(.13,.12-index*.07,.02),.022,.085,"accent",saddle,rotation=(math.pi/2,0,0),vertices=max(10,f.seg//2))
    optic=f.empty("weapon-optic",f.frame,"optic")
    f.rail("BenelliM4_TopRail",.22,-.25,.22,.18,optic,teeth=7 if f.hero else 4 if f.high else 3)
    f.torus("BenelliM4_GhostRing",(0,.18,.29),.034,.008,"metal",optic,rotation=(math.pi/2,0,0))
    f.cube("BenelliM4_FrontPost",(0,-.82,.21),(.045,.045,.13),"primary",optic,bevel=.005)
    f.cylinder("BenelliM4_ChargingHandle",(.15,.03,.08),.02,.11,"metal",f.action,rotation=(0,math.pi/2,0))
    return stock,magazine,optic,f.socket_set(
        grip=(0,.22,-.39),support=(-.1,-.5,-.05),reload=(-.11,.03,-.18),magazine=(0,.03,-.15),
        muzzle=(0,-1.02,.1),eject=(.13,-.04,.08),optic=(0,-.04,.27),rear_sight=(0,.18,.29),front_sight=(0,-.82,.29),
    ),"argo-dual-piston-semi-auto-shotgun-fixed-tube-ghost-ring-shell-saddle"


def sidearm_common(f: Forge, kind: str):
    is_deagle=kind=="deagle"; is_g18=kind=="g18"; is_usp=kind=="usp"
    slide_width=.24 if is_deagle else .205 if is_usp else .185
    slide_height=.165 if is_deagle else .125 if is_usp else .115
    front=-.52 if is_deagle else -.39 if is_usp else -.35 if is_g18 else -.32
    rear=.22 if is_deagle else .19 if is_usp else .18
    slide_parent=f.empty({"g17":"glock17-slide","g18":"glock18-ported-slide","deagle":"deagle-heavy-slide","usp":"usp45-action-slide"}[kind],f.action,"signature")
    slide_z=.078 if is_deagle else .07
    f.prism(
        f"{kind}_Slide",
        ((rear,slide_width*.82,slide_height*.82,slide_z),
         (.09,slide_width*.94,slide_height,slide_z),
         (-.1,slide_width,slide_height*1.08,slide_z),
         (front+.07,slide_width*.9,slide_height*.94,slide_z),
         (front,slide_width*.72,slide_height*.76,slide_z)),
        "primary",slide_parent,.16,
    )
    f.cube(f"{kind}_EjectionPort",(slide_width*.51,-.07,slide_z+.025),(.012,.14,.055),"metal",slide_parent,bevel=.003)
    if f.high:
        for side in (-1,1):
            for index in range(5):
                f.cube(f"{kind}_RearSerration{side}_{index}",(side*(slide_width*.505),.1-index*.026,.1),(.01,.012,.095),"metal",slide_parent,rotation=(0,0,side*math.radians(-8)),bevel=.001)
        # A separately finished extractor, rear plate and top machining line
        # give the slide readable mechanical layers in first person.
        f.cube(f"{kind}_Extractor",(slide_width*.515,-.155,.11),(.012,.085,.026),"accent",slide_parent,bevel=.002)
        f.cube(f"{kind}_RearPlate",(0,rear+.008,.095),(slide_width*.72,.018,.085),"metal",slide_parent,bevel=.003)
        f.cube(f"{kind}_TopRib",(0,-.08,slide_z+slide_height*.53),(.045,abs(front)*.62,.012),"metal",slide_parent,bevel=.002)
        if kind in {"g17","g18","usp"}:
            for side in (-1,1):
                for index in range(3 if f.hero else 2):
                    f.cube(f"{kind}_FrontSerration{side}_{index}",(side*(slide_width*.505),front+.075+index*.025,.1),(.01,.011,.082),"metal",slide_parent,rotation=(0,0,-side*math.radians(8)),bevel=.001)
    frame_sig={"g17":"glock17-polymer-frame","g18":"glock18-polymer-frame","deagle":"deagle-oversized-grip","usp":"usp45-polymer-frame"}[kind]
    frame_root=f.empty(frame_sig,f.frame,"signature")
    f.prism(
        f"{kind}_Frame",
        ((.2,.13,.085,-.03),(.07,.175,.12,-.035),(-.12,.19,.125,-.035),
         (front*.58,.165,.105,-.032),(front*.78,.135,.075,-.025)),
        "polymer",frame_root,.26,
    )
    f.mag_prism(
        f"{kind}_Grip",
        ((-.05,.15,.17,.13),(-.22,.175,.195,.155),(-.43,.15,.18,.205)),
        "polymer",frame_root,.22,
    )
    f.cube(f"{kind}_Backstrap",(0,.298,-.25),(.145,.035,.31),"rubber",frame_root,rotation=(math.radians(-7),0,0),bevel=.018)
    if f.high:
        for index in range(4):
            f.cube(f"{kind}_GripGroove{index}",(slide_width*.45,.085+index*.045,-.18-index*.055),(.012,.025,.025),"primary",frame_root,bevel=.002)
        for side in (-1,1):
            f.cylinder(f"{kind}_FramePin{side}",(side*slide_width*.48,.05,-.035),.009,.01,"metal",frame_root,rotation=(0,math.pi/2,0),vertices=8,bevel=.001)
            # Sparse moulded stippling reads at hero distance without turning
            # the grip into noisy procedural displacement.
            for row in range(3 if f.hero else 2):
                for column in range(3 if f.hero else 2):
                    f.cube(
                        f"{kind}_GripStipple{side}_{row}_{column}",
                        (side*.089,.115+column*.045,-.18-row*.07),
                        (.008,.025,.025),"rubber",frame_root,
                        rotation=(0,0,(row-column)*math.radians(4)),bevel=.002,
                    )
        if not is_deagle:
            rail=f.empty(f"{kind}-accessory-rail",frame_root,"manufactured-detail")
            f.cube(f"{kind}_AccessoryRailSpine",(0,front*.56,-.091),(.13,.18,.028),"primary",rail,bevel=.004)
            for index in range(3 if f.hero else 2):
                f.cube(f"{kind}_AccessoryRailSlot{index}",(0,front*.56-.05+index*.05,-.107),(.145,.018,.018),"metal",rail,bevel=.002)
        f.cube(f"{kind}_SerialInsert",(-slide_width*.49,-.03,-.045),(.012,.13,.035),"metal",frame_root,bevel=.002)
    f.open_trigger(kind,-.09,-.095,.14,.16,frame_root)
    barrel_end=front-.03 if is_deagle else front+.012
    f.barrel_y(f"{kind}_Barrel",-.1,barrel_end,.07,.029 if not is_deagle else .039,"metal",f.frame)
    f.cylinder(f"{kind}_Bore",(0,front-.004,.07),.014 if not is_deagle else .02,.009,"rubber",f.frame,rotation=(math.pi/2,0,0),bevel=0)
    magazine=f.empty("weapon-magazine",f.frame,"magazine")
    sig={"g17":"glock17-magazine","g18":"glock18-extended-magazine","deagle":"deagle-heavy-magazine","usp":"usp45-magazine"}[kind]
    mag_sig=f.empty(sig,magazine,"signature")
    bottom=-.69 if is_g18 else -.43
    f.mag_prism(f"{kind}_Magazine",((-.08,.115,.115,.145),(bottom,.105,.1,.195)),"metal",mag_sig,.14)
    f.cube(f"{kind}_Floorplate",(0,.195,bottom-.015),(.145,.125,.025),"metal",mag_sig,bevel=.004)
    optic=f.empty("weapon-optic",f.frame,"optic")
    sight_z=slide_z+slide_height*.62+.035
    f.cube(f"{kind}_RearSight",(0,.13,sight_z),(.085,.032,.038),"primary",optic,bevel=.004)
    f.cube(f"{kind}_FrontSight",(0,front+.05,sight_z),(.035,.03,.042),"primary",optic,bevel=.004)
    if f.high:
        f.cylinder(f"{kind}_FrontSightDot",(0,front+.029,sight_z+.012),.009,.005,"accent",optic,rotation=(math.pi/2,0,0),vertices=10,bevel=0)
        for side in (-1,1):
            f.cylinder(f"{kind}_RearSightDot{side}",(side*.031,.108,sight_z+.01),.007,.005,"accent",optic,rotation=(math.pi/2,0,0),vertices=10,bevel=0)
    return frame_root,magazine,optic,front


def service_sidearm_common(f: Forge, kind: str):
    """Author the service pistols around handgun proportions, not scaled rifle boxes."""
    is_g18=kind=="g18"; is_usp=kind=="usp"
    slide_width=.148 if is_usp else .132 if is_g18 else .128
    slide_height=.104 if is_usp else .09
    front=-.46 if is_usp else -.4 if is_g18 else -.375
    rear=.215 if is_usp else .19
    slide_z=.065
    slide_parent=f.empty(
        {"g17":"glock17-slide","g18":"glock18-ported-slide","usp":"usp45-action-slide"}[kind],
        f.action,"signature",
    )
    f.prism(
        f"{kind}_ServiceSlide",
        ((rear,slide_width*.76,slide_height*.72,slide_z),
         (.11,slide_width*.92,slide_height*.94,slide_z),
         (-.08,slide_width,slide_height,slide_z),
         (front+.08,slide_width*.9,slide_height*.88,slide_z),
         (front,slide_width*.68,slide_height*.64,slide_z)),
        "primary",slide_parent,.22,
    )
    port_height=.042 if is_usp else .034
    f.cube(
        f"{kind}_EjectionPort",(slide_width*.505,-.085,slide_z+.018),
        (.008,.115,port_height),"metal",slide_parent,bevel=.002,
    )
    if f.high:
        for side in (-1,1):
            for index in range(5 if f.hero else 4):
                f.cube(
                    f"{kind}_RearSerration{side}_{index}",
                    (side*slide_width*.505,.105-index*.022,slide_z+.008),
                    (.007,.009,slide_height*.65),"metal",slide_parent,
                    rotation=(0,0,side*math.radians(-7)),bevel=.001,
                )
            for index in range(3 if f.hero else 2):
                f.cube(
                    f"{kind}_FrontSerration{side}_{index}",
                    (side*slide_width*.505,front+.072+index*.024,slide_z+.006),
                    (.007,.009,slide_height*.52),"metal",slide_parent,
                    rotation=(0,0,-side*math.radians(7)),bevel=.001,
                )
        f.cube(f"{kind}_Extractor",(slide_width*.51,-.17,slide_z+.016),(.009,.07,.02),"accent",slide_parent,bevel=.002)
        f.cube(f"{kind}_RearPlate",(0,rear+.006,slide_z),(.09,.014,.06),"metal",slide_parent,bevel=.003)

    frame_sig={"g17":"glock17-polymer-frame","g18":"glock18-polymer-frame","usp":"usp45-polymer-frame"}[kind]
    frame_root=f.empty(frame_sig,f.frame,"signature")
    f.prism(
        f"{kind}_ErgonomicFrame",
        ((.205,slide_width*.62,.06,-.022),(.08,slide_width*.82,.082,-.03),
         (-.12,slide_width*.94,.09,-.032),(front*.58,slide_width*.82,.07,-.028),
         (front*.8,slide_width*.6,.05,-.02)),
        "polymer",frame_root,.3,
    )
    grip_bottom=-.335 if is_usp else -.305
    f.mag_prism(
        f"{kind}_AngledGrip",
        ((-.045,slide_width*.7,.105,.105),(-.12,slide_width*.82,.12,.13),
         (-.22,slide_width*.84,.125,.165),(grip_bottom,slide_width*.72,.11,.195)),
        "polymer",frame_root,.3,
    )
    grip_center_z=(grip_bottom-.045)*.5
    f.cube(
        f"{kind}_Backstrap",(0,.222,grip_center_z),
        (slide_width*.64,.022,abs(grip_bottom+.045)*.78),"rubber",frame_root,
        rotation=(math.radians(-8),0,0),bevel=.012,
    )
    if f.high:
        for side in (-1,1):
            f.cylinder(
                f"{kind}_FramePin{side}",(side*slide_width*.44,.045,-.028),
                .006,.008,"metal",frame_root,rotation=(0,math.pi/2,0),vertices=8,bevel=0,
            )
            # Fine horizontal checking bands replace the former high-contrast
            # square blocks that read like a keypad.
            for index in range(3 if f.hero else 2):
                f.cube(
                    f"{kind}_GripCheckBand{side}_{index}",
                    (side*slide_width*.415,.177,-.145-index*.06),
                    (.005,.05,.008),"polymer",frame_root,bevel=.001,
                )
        rail=f.empty(f"{kind}-accessory-rail",frame_root,"manufactured-detail")
        f.cube(f"{kind}_AccessoryRailSpine",(0,front*.55,-.071),(slide_width*.76,.17,.02),"primary",rail,bevel=.003)
        for index in range(3 if f.hero else 2):
            f.cube(f"{kind}_AccessoryRailSlot{index}",(0,front*.55-.045+index*.045,-.082),(slide_width*.88,.014,.012),"metal",rail,bevel=.001)
        f.cube(f"{kind}_SerialInsert",(-slide_width*.46,-.025,-.04),(.008,.1,.024),"metal",frame_root,bevel=.001)

    guard_root=f.empty(f"{kind}-integrated-trigger-guard",frame_root,"manufactured-detail")
    guard=f.torus(
        f"{kind}_RoundedTriggerGuard",(0,-.085,-.093),.052,.008,
        "polymer",guard_root,rotation=(0,math.pi/2,0),segments=max(12,f.seg),
    )
    guard.scale=(1.0,1.16,.78)
    f.between(
        f"{kind}_Trigger",(0,-.045,-.06),(0,-.09,-.125),.005,
        "metal",f.action,vertices=max(8,f.seg//2),bevel=.001,
    )

    barrel_radius=.019 if is_usp else .017
    f.barrel_y(f"{kind}_Barrel",-.1,front+.012,slide_z,barrel_radius,"metal",f.frame)
    f.cylinder(f"{kind}_MuzzleFace",(0,front+.003,slide_z),barrel_radius*1.03,.008,"metal",f.frame,rotation=(math.pi/2,0,0),bevel=.001)
    f.cylinder(f"{kind}_Bore",(0,front-.002,slide_z),barrel_radius*.5,.01,"rubber",f.frame,rotation=(math.pi/2,0,0),bevel=0)

    magazine=f.empty("weapon-magazine",f.frame,"magazine")
    sig={"g17":"glock17-magazine","g18":"glock18-extended-magazine","usp":"usp45-magazine"}[kind]
    mag_sig=f.empty(sig,magazine,"signature")
    mag_bottom=-.56 if is_g18 else grip_bottom-.012
    mag_width=.094 if is_usp else .086
    f.mag_prism(
        f"{kind}_Magazine",
        ((-.075,mag_width,.09,.14),(-.19,mag_width*.96,.085,.165),
         (mag_bottom,mag_width*.88,.078,.19)),
        "metal",mag_sig,.24,
    )
    f.cube(
        f"{kind}_Floorplate",(0,.19,mag_bottom-.012),
        (mag_width*1.18,.09,.02),"metal",mag_sig,bevel=.004,
    )

    optic=f.empty("weapon-optic",f.frame,"optic")
    sight_raise=.018 if is_usp else 0
    sight_z=slide_z+slide_height*.54+.018+sight_raise
    f.cube(f"{kind}_RearSightBase",(0,.135,sight_z),(.074,.03,.018),"primary",optic,bevel=.003)
    for side in (-1,1):
        f.cube(f"{kind}_RearSightEar{side}",(side*.028,.135,sight_z+.018),(.018,.027,.034),"primary",optic,bevel=.003)
    f.cube(f"{kind}_FrontSight",(0,front+.055,sight_z+.01),(.024,.026,.036),"primary",optic,bevel=.003)
    if f.high:
        f.cylinder(f"{kind}_FrontSightDot",(0,front+.04,sight_z+.014),.005,.004,"accent",optic,rotation=(math.pi/2,0,0),vertices=8,bevel=0)
        for side in (-1,1):
            f.cylinder(f"{kind}_RearSightDot{side}",(side*.028,.119,sight_z+.021),.004,.004,"accent",optic,rotation=(math.pi/2,0,0),vertices=8,bevel=0)
    return frame_root,magazine,optic,front


def glock17(f: Forge):
    stock,magazine,optic,front=service_sidearm_common(f,"g17")
    safety=f.empty("glock17-trigger-safety",f.action,"signature")
    f.cube("G17_TriggerSafety",(0,-.08,-.15),(.016,.035,.055),"accent",safety,rotation=(math.radians(-12),0,0),bevel=.003)
    controls=f.empty("glock17-service-controls",f.frame,"manufactured-detail")
    f.cube("G17_SlideStop",(.066,.035,.02),(.009,.09,.018),"metal",controls,bevel=.002)
    f.cube("G17_TakedownLever",(.067,-.115,-.04),(.01,.05,.018),"metal",controls,bevel=.002)
    f.cylinder("G17_MagRelease",(.059,.135,-.115),.012,.01,"accent",controls,rotation=(0,math.pi/2,0),vertices=10,bevel=.001)
    if f.high:
        f.cube("G17_FrameDustCover",(0,-.255,-.028),(.105,.14,.055),"polymer",controls,bevel=.01)
    return stock,magazine,optic,f.socket_set(
        grip=(0,.19,-.24),support=(-.06,-.2,-.045),reload=(-.07,.17,-.3),magazine=(0,.17,-.18),
        muzzle=(0,front-.035,.065),eject=(.067,-.07,.1),optic=(0,-.08,.14),rear_sight=(0,.135,.14),front_sight=(0,front+.055,.14),
    ),"service-pistol-polymer-frame-striker-slide-trigger-safety-flush-magazine"


def glock18(f: Forge):
    stock,magazine,optic,front=service_sidearm_common(f,"g18")
    selector=f.empty("glock18-selector",f.action,"signature")
    f.cube("G18_Selector",(.075,.08,.095),(.024,.052,.04),"accent",selector,bevel=.005)
    if f.high:
        f.cylinder("G18_SelectorIndex",(.088,.055,.102),.007,.006,"emissive",selector,rotation=(0,math.pi/2,0),vertices=10,bevel=0)
        for index in range(4):
            f.cube(f"G18_TopPort{index}",(0,-.29+index*.055,.112),(.075,.027,.01),"rubber",selector,bevel=.002)
            f.cube(f"G18_PortBarrelGlint{index}",(0,-.29+index*.055,.106),(.047,.019,.006),"accent",selector,bevel=.001)
        for index,z in enumerate((-.2,-.29,-.38,-.47)):
            f.cylinder(f"G18_MagWitness{index}",(.044,.19,z),.006,.005,"rubber",magazine,rotation=(0,math.pi/2,0),vertices=8,bevel=0)
        # Reuse the witness-hole rubber batch; a third magazine material would
        # push drop LOD above the strict twelve-primitive runtime budget.
        f.cube("G18_ExtendedMagCollar",(0,.155,-.095),(.1,.095,.025),"rubber",magazine,bevel=.005)
        f.prism(
            "G18_CompensatorNose",
            ((front+.025,.13,.08,.065),(front-.025,.145,.09,.065),(front-.075,.12,.072,.065)),
            "primary",selector,.2,
        )
        for side in (-1,1):
            f.cube(f"G18_CompVent{side}",(side*.073,front-.045,.082),(.007,.034,.026),"rubber",selector,bevel=.001)
    return stock,magazine,optic,f.socket_set(
        grip=(0,.19,-.24),support=(-.06,-.2,-.045),reload=(-.07,.19,-.52),magazine=(0,.17,-.2),
        muzzle=(0,front-.085,.065),eject=(.07,-.07,.1),optic=(0,-.08,.14),rear_sight=(0,.135,.14),front_sight=(0,front+.055,.14),
    ),"select-fire-polymer-pistol-ported-slide-selector-extended-magazine"


def desert_eagle(f: Forge):
    stock,magazine,optic,front=sidearm_common(f,"deagle")
    rib=f.empty("deagle-gas-rib",f.frame,"signature")
    f.prism("Deagle_GasRib",((.16,.12,.045,.19),(-.1,.17,.06,.195),(-.43,.13,.045,.185)),"metal",rib,.12)
    f.cylinder("Deagle_GasPiston",(0,-.31,-.015),.04,.3,"metal",rib,rotation=(math.pi/2,0,0))
    if f.high:
        for index in range(3):
            f.cube(f"Deagle_RibVent{index}",(0,-.18-index*.07,.222),(.09,.03,.018),"rubber",rib,bevel=.002)
    f.cube("Deagle_Safety",(.13,.1,.12),(.025,.065,.045),"accent",f.action,bevel=.005)
    return stock,magazine,optic,f.socket_set(
        grip=(0,.22,-.22),support=(-.1,-.22,-.05),reload=(-.11,.18,-.38),magazine=(0,.18,-.18),
        muzzle=(0,front-.07,.075),eject=(.125,-.06,.14),optic=(0,-.1,.2),rear_sight=(0,.13,.2),front_sight=(0,front+.05,.2),
    ),"oversized-gas-operated-pistol-heavy-slide-barrel-rib-large-bore-magazine"


def usp45(f: Forge):
    stock,magazine,optic,front=service_sidearm_common(f,"usp")
    barrel=f.empty("usp45-threaded-barrel",f.frame,"signature")
    f.cylinder("USP45_ThreadedMuzzle",(0,front-.055,.065),.021,.105,"metal",barrel,rotation=(math.pi/2,0,0))
    if f.high:
        for index in range(4): f.torus(f"USP45_Thread{index}",(0,front-.07-index*.011,.065),.022,.002,"metal",barrel,rotation=(math.pi/2,0,0),segments=max(12,f.seg))
    suppressor=f.empty("usp45-tactical-suppressor",f.frame,"manufactured-detail")
    f.cylinder("USP45_SuppressorBody",(0,front-.25,.065),.046,.34,"primary",suppressor,rotation=(math.pi/2,0,0),vertices=max(14,f.seg),bevel=.006)
    f.cylinder("USP45_SuppressorFrontCap",(0,front-.425,.065),.043,.018,"metal",suppressor,rotation=(math.pi/2,0,0),vertices=max(14,f.seg),bevel=.002)
    f.cylinder("USP45_SuppressorBore",(0,front-.437,.065),.013,.008,"rubber",suppressor,rotation=(math.pi/2,0,0),vertices=10,bevel=0)
    if f.high:
        for index in range(5 if f.hero else 3):
            f.torus(f"USP45_SuppressorRib{index}",(0,front-.12-index*.045,.065),.047,.003,"metal",suppressor,rotation=(math.pi/2,0,0),segments=max(12,f.seg))
    light=f.empty("usp45-underbarrel-flashlight",f.frame,"signature")
    f.prism("USP45_LightShroud",((-.11,.15,.12,-.075),(-.25,.17,.14,-.08),(-.39,.13,.11,-.075)),"primary",light,.24)
    f.cylinder("USP45_LightBody",(0,-.25,-.08),.055,.22,"polymer",light,rotation=(math.pi/2,0,0))
    f.cylinder("USP45_LightLens",(0,-.37,-.08),.045,.012,"lens",light,rotation=(math.pi/2,0,0),bevel=0)
    f.cube("USP45_LightBezel",(0,-.383,-.08),(.13,.035,.115),"metal",light,bevel=.018)
    f.cylinder("USP45_LightLensFront",(0,-.403,-.08),.043,.01,"lens",light,rotation=(math.pi/2,0,0),bevel=0)
    for side in (-1,1):
        f.cube(f"USP45_LightSwitch{side}",(side*.072,-.15,-.11),(.025,.06,.04),"accent",light,rotation=(0,0,side*math.radians(8)),bevel=.004)
    paddle=f.empty("usp45-paddle-control",f.action,"signature")
    f.cube("USP45_Paddle",(.078,.02,-.066),(.018,.08,.04),"metal",paddle,bevel=.004)
    f.prism("USP45_Hammer",((.22,.075,.06,.12),(.25,.055,.08,.155)),"metal",f.action,.22)
    f.cube("USP45_SafetyDecocker",(.08,.095,.058),(.018,.09,.026),"accent",paddle,rotation=(0,0,math.radians(-5)),bevel=.004)
    f.cube("USP45_SlideStop",(.077,-.005,.015),(.011,.12,.02),"metal",paddle,bevel=.003)
    if f.high:
        for index in range(4 if f.hero else 3):
            f.cube(f"USP45_FrontStrapCheck{index}",(0,.095,-.17-index*.055),(.12,.012,.022),"rubber",stock,bevel=.002)
    return stock,magazine,optic,f.socket_set(
        grip=(0,.2,-.25),support=(-.07,-.25,-.05),reload=(-.075,.18,-.33),magazine=(0,.18,-.19),
        muzzle=(0,front-.445,.065),eject=(.078,-.07,.11),optic=(0,-.08,.155),rear_sight=(0,.135,.155),front_sight=(0,front+.055,.155),
    ),"hammer-fired-tactical-pistol-threaded-barrel-suppressor-paddle-control-weapon-light"


BUILDERS = {
    "carbine": hk416,
    "ak-47": ak47,
    "smg": p90,
    "mp5": mp5,
    "mini-uzi": mini_uzi,
    "lmg": m249,
    "scattergun": remington870,
    "sniper": m40a5,
    "railgun": railgun,
    "minigun": m134,
    "m14-ebr": m14_ebr,
    "slug-shotgun": benelli_m4,
    "pistol": glock17,
    "machine-pistol": glock18,
    "magnum": desert_eagle,
    "flashlight-pistol": usp45,
}


def build_platform(api, spec, frame, receiver, action, materials, detail, label):
    builder = BUILDERS.get(spec["id"])
    if builder is None:
        return None
    forge = Forge(api, spec, frame, receiver, action, materials, detail, label)
    return builder(forge)
