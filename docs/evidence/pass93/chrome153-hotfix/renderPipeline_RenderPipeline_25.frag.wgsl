// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms
@binding( 0 ) @group( 1 ) var nodeUniform0_sampler : sampler;
@binding( 1 ) @group( 1 ) var nodeUniform0 : texture_2d<f32>;
@binding( 3 ) @group( 1 ) var nodeUniform3_sampler : sampler;
@binding( 4 ) @group( 1 ) var nodeUniform3 : texture_3d<f32>;
@binding( 5 ) @group( 1 ) var nodeUniform10 : texture_depth_multisampled_2d;
@binding( 6 ) @group( 1 ) var nodeUniform15_sampler : sampler;
@binding( 7 ) @group( 1 ) var nodeUniform15 : texture_2d<f32>;
@binding( 8 ) @group( 1 ) var nodeUniform16_sampler : sampler;
@binding( 9 ) @group( 1 ) var nodeUniform16 : texture_3d<f32>;
@binding( 10 ) @group( 1 ) var nodeUniform17_sampler : sampler;
@binding( 11 ) @group( 1 ) var nodeUniform17 : texture_3d<f32>;
@binding( 12 ) @group( 1 ) var nodeUniform20_sampler : sampler;
@binding( 13 ) @group( 1 ) var nodeUniform20 : texture_2d<f32>;
@binding( 14 ) @group( 1 ) var nodeUniform22 : texture_2d<f32>;
@binding( 16 ) @group( 1 ) var nodeUniform32_sampler : sampler;
@binding( 17 ) @group( 1 ) var nodeUniform32 : texture_2d<f32>;
@binding( 18 ) @group( 1 ) var nodeUniform33_sampler : sampler;
@binding( 19 ) @group( 1 ) var nodeUniform33 : texture_2d<f32>;
@binding( 21 ) @group( 1 ) var nodeUniform50_sampler : sampler;
@binding( 22 ) @group( 1 ) var nodeUniform50 : texture_2d<f32>;
@binding( 23 ) @group( 1 ) var nodeUniform51_sampler : sampler;
@binding( 24 ) @group( 1 ) var nodeUniform51 : texture_2d<f32>;

struct NodeBuffer_1941Struct {
	value : array< vec4<f32>, 16 >
};
@binding( 15 ) @group( 1 )
var<uniform> NodeBuffer_1941 : NodeBuffer_1941Struct;

struct NodeBuffer_1867Struct {
	value : array< vec4<f32>, 96 >
};
@binding( 20 ) @group( 1 )
var<uniform> NodeBuffer_1867 : NodeBuffer_1867Struct;

struct objectStruct {
	nodeUniform1 : f32,
	nodeUniform2 : f32,
	nodeUniform4 : mat4x4<f32>,
	nodeUniform5 : vec2<f32>,
	nodeUniform6 : f32,
	nodeUniform7 : f32,
	nodeUniform8 : f32,
	nodeUniform9 : f32,
	nodeUniform11 : vec3<f32>,
	nodeUniform12 : vec3<f32>,
	nodeUniform13 : vec3<f32>,
	nodeUniform14 : mat3x3<f32>,
	nodeUniform18 : f32,
	nodeUniform19 : f32,
	nodeUniform21 : mat4x4<f32>,
	nodeUniform23 : mat3x3<f32>,
	nodeUniform24 : vec2<f32>,
	nodeUniform25 : f32,
	nodeUniform27 : f32,
	nodeUniform28 : f32,
	nodeUniform29 : f32,
	nodeUniform30 : f32,
	nodeUniform31 : f32,
	nodeUniform34 : f32,
	nodeUniform35 : f32,
	nodeUniform37 : mat4x4<f32>,
	nodeUniform38 : f32,
	nodeUniform39 : f32,
	nodeUniform40 : mat3x3<f32>,
	nodeUniform41 : vec3<f32>,
	nodeUniform42 : vec3<f32>,
	nodeUniform43 : vec3<f32>,
	nodeUniform44 : f32,
	nodeUniform45 : vec3<f32>,
	nodeUniform46 : vec3<f32>,
	nodeUniform47 : f32,
	nodeUniform48 : f32,
	nodeUniform49 : f32,
	nodeUniform52 : vec3<f32>,
	nodeUniform53 : vec3<f32>,
	nodeUniform54 : vec3<f32>,
	nodeUniform55 : vec3<f32>,
	nodeUniform56 : f32,
	nodeUniform57 : f32,
	nodeUniform58 : f32,
	nodeUniform59 : f32,
	nodeUniform60 : f32,
	nodeUniform62 : f32,
	nodeUniform63 : f32,
	nodeUniform64 : f32,
	nodeUniform65 : f32,
	nodeUniform66 : f32,
	nodeUniform67 : f32,
	nodeUniform68 : vec3<f32>,
	nodeUniform69 : f32,
	nodeUniform70 : f32,
	nodeUniform71 : vec3<f32>,
	nodeUniform72 : f32,
	nodeUniform73 : f32,
	nodeUniform74 : f32,
	nodeUniform75 : f32,
	nodeUniform78 : mat4x4<f32>
};
@binding( 2 ) @group( 1 )
var<uniform> object : objectStruct;

struct renderStruct {
	cameraProjectionMatrix : mat4x4<f32>,
	cameraViewMatrix : mat4x4<f32>,
	nodeUniform61 : f32
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

// vars
var<private> nodeVar0 : vec4<f32>;
var<private> nodeVar1 : vec2<f32>;
var<private> nodeVar2 : f32;
var<private> nodeVar3 : vec2<u32>;
var<private> nodeVar4 : f32;
var<private> nodeVar5 : f32;
var<private> nodeVar6 : vec3<f32>;
var<private> nodeVar7 : vec3<f32>;
var<private> nodeVar8 : vec4<f32>;
var<private> nodeVar9 : vec4<f32>;
var<private> nodeVar10 : vec3<f32>;
var<private> nodeVar11 : vec4<f32>;
var<private> nodeVar12 : vec4<f32>;
var<private> nodeVar13 : f32;
var<private> nodeVar14 : f32;
var<private> nodeVar15 : vec4<f32>;
var<private> nodeVar16 : vec3<f32>;
var<private> nodeVar17 : vec4<f32>;
var<private> nodeVar18 : vec4<f32>;
var<private> nodeVar19 : vec4<f32>;
var<private> nodeVar20 : vec4<f32>;
var<private> nodeVar21 : vec2<u32>;
var<private> nodeVar22 : vec4<f32>;
var<private> nodeVar23 : f32;
var<private> nodeVar24 : vec3<f32>;
var<private> nodeVar25 : vec2<f32>;
var<private> nodeVar26 : vec2<f32>;
var<private> nodeVar27 : vec4<f32>;
var<private> nodeVar28 : vec4<f32>;
var<private> nodeVar29 : f32;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : vec4<f32>;
var<private> nodeVar32 : vec3<f32>;
var<private> nodeVar33 : vec3<f32>;
var<private> nodeVar34 : f32;
var<private> nodeVar35 : f32;
var<private> nodeVar36 : f32;
var<private> nodeVar37 : f32;
var<private> nodeVar38 : f32;
var<private> nodeVar39 : f32;
var<private> nodeVar40 : vec4<f32>;
var<private> nodeVar41 : vec4<f32>;
var<private> nodeVar42 : vec4<f32>;
var<private> nodeVar43 : vec4<f32>;
var<private> nodeVar44 : vec3<f32>;
var<private> nodeVar45 : f32;
var<private> nodeVar46 : f32;
var<private> nodeVar47 : f32;
var<private> nodeVar48 : f32;
var<private> nodeVar49 : i32;
var<private> nodeVar50 : vec2<f32>;
var<private> nodeVar51 : vec3<f32>;
var<private> nodeVar52 : vec3<f32>;
var<private> nodeVar53 : f32;
var<private> nodeVar54 : f32;
var<private> nodeVar55 : vec3<f32>;
var<private> nodeVar56 : vec3<f32>;
var<private> nodeVar57 : vec3<f32>;
var<private> nodeVar58 : vec3<f32>;
var<private> nodeVar59 : vec3<f32>;
var<private> nodeVar60 : vec3<f32>;
var<private> nodeVar61 : vec3<f32>;
var<private> nodeVar62 : vec3<f32>;
var<private> nodeVar63 : vec2<f32>;
var<private> nodeVar64 : f32;
var<private> nodeVar65 : vec2<f32>;
var<private> nodeVar66 : vec3<f32>;
var<private> nodeVar67 : vec3<f32>;
var<private> nodeVar68 : vec3<f32>;
var<private> nodeVar69 : vec3<f32>;
var<private> nodeVar70 : vec3<f32>;
var<private> nodeVar71 : f32;
var<private> nodeVar72 : f32;
var<private> nodeVar73 : vec3<f32>;
var<private> nodeVar74 : vec3<f32>;
var<private> nodeVar75 : f32;
var<private> nodeVar76 : vec3<f32>;
var<private> nodeVar77 : vec3<f32>;
var<private> nodeVar78 : f32;
var<private> nodeVar79 : i32;
var<private> nodeVar80 : vec3<f32>;
var<private> nodeVar81 : f32;
var<private> nodeVar82 : f32;
var<private> nodeVar83 : vec3<f32>;
var<private> nodeVar84 : vec3<f32>;
var<private> nodeVar85 : vec3<f32>;
var<private> nodeVar86 : vec3<f32>;
var<private> nodeVar87 : vec3<f32>;
var<private> nodeVar88 : vec3<f32>;
var<private> nodeVar89 : vec3<f32>;
var<private> nodeVar90 : vec2<f32>;
var<private> nodeVar91 : vec3<f32>;
var<private> nodeVar92 : vec3<f32>;
var<private> nodeVar93 : vec3<f32>;
var<private> nodeVar94 : vec3<f32>;
var<private> nodeVar95 : vec4<f32>;
var<private> nodeVar96 : vec4<f32>;
var<private> nodeVar97 : vec2<f32>;
var<private> nodeVar98 : f32;
var<private> nodeVar99 : f32;
var<private> nodeVar100 : f32;
var<private> nodeVar101 : vec4<f32>;
var<private> nodeVar102 : vec4<f32>;
var<private> nodeVar103 : vec4<f32>;
var<private> nodeVar104 : vec3<f32>;
var<private> nodeVar105 : vec3<f32>;
var<private> nodeVar106 : f32;
var<private> nodeVar107 : f32;
var<private> nodeVar108 : vec4<f32>;
var<private> nodeVar109 : vec4<f32>;
var<private> nodeVar110 : vec4<f32>;
var<private> nodeVar111 : vec4<f32>;
var<private> nodeVar112 : vec3<f32>;
var<private> nodeVar113 : f32;
var<private> nodeVar114 : f32;
var<private> nodeVar115 : vec3<f32>;
var<private> nodeVar116 : f32;
var<private> nodeVar117 : vec3<f32>;
var<private> nodeVar118 : vec2<f32>;

// codes
fn tsl_clampWrapping_float( coord: f32 ) -> f32 { return clamp( coord, 0.0, 1.0 ); }
fn tsl_coord_clampS_clampT_2d( coord : vec2f ) -> vec2f {

	return vec2f(
		tsl_clampWrapping_float( coord.x ),
		tsl_clampWrapping_float( coord.y )
	);

}

fn tsl_repeatWrapping_float( coord: f32 ) -> f32 { return fract( coord ); }
fn tsl_coord_repeatS_repeatT_2d( coord : vec2f ) -> vec2f {

	return vec2f(
		tsl_repeatWrapping_float( coord.x ),
		tsl_repeatWrapping_float( coord.y )
	);

}

fn tsl_mod_float( x : f32, y : f32 ) -> f32 { return x - y * floor( x / y ); }
fn fn1 ( color : vec4<f32> ) -> vec4<f32> {

	var nodeVar0 : vec4<f32>;


	if ( ( color.w == 0.0 ) ) {

		nodeVar0 = vec4<f32>( 0.0, 0.0, 0.0, 0.0 );

	} else {

		nodeVar0 = vec4<f32>( ( color.xyz / vec3<f32>( color.w ) ), color.w );

	}


	return nodeVar0;

}

fn acesFilmicToneMapping ( color : vec3<f32>, exposure : f32 ) -> vec3<f32> {

	var nodeVar0 : vec3<f32>;

	nodeVar0 = ( mat3x3<f32>( 0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777 ) * ( ( color * vec3<f32>( exposure ) ) / vec3<f32>( 0.6 ) ) );

	return clamp( ( mat3x3<f32>( 1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602 ) * ( ( ( nodeVar0 * ( nodeVar0 + vec3<f32>( 0.0245786 ) ) ) - vec3<f32>( 0.000090537 ) ) / ( ( nodeVar0 * ( ( nodeVar0 + vec3<f32>( 0.432951 ) ) * vec3<f32>( 0.983729 ) ) ) + vec3<f32>( 0.238081 ) ) ) ), vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) );

}

fn sRGBTransferOETF ( color : vec3<f32> ) -> vec3<f32> {

	


	return mix( ( ( pow( color, vec3<f32>( 0.41666 ) ) * vec3<f32>( 1.055 ) ) - vec3<f32>( 0.055 ) ), ( color * vec3<f32>( 12.92 ) ), vec3<f32>( ( color <= vec3<f32>( 0.0031308 ) ) ) );

}

fn fn0 ( color : vec4<f32> ) -> vec4<f32> {

	


	return vec4<f32>( ( color.xyz * vec3<f32>( color.w ) ), color.w );

}



@fragment
fn main( @location( 0 ) nodeVarying4 : vec2<f32>,
	@builtin( position ) fragCoord : vec4<f32> ) -> OutputStruct {

	// flow
	// code

	nodeVar0 = textureSample( nodeUniform0, nodeUniform0_sampler, nodeVarying4 );
	nodeVar1 = ( ( ( fragCoord.xy / object.nodeUniform5 ) * vec2<f32>( 2.0 ) ) - vec2<f32>( 1.0 ) );
	nodeVar3 = textureDimensions( nodeUniform10 );
	nodeVar2 = textureLoad( nodeUniform10, vec2<u32>( clamp( floor( tsl_coord_clampS_clampT_2d( nodeVarying4 ) * vec2<f32>( nodeVar3 ) ), vec2<f32>( 0 ), vec2<f32>( nodeVar3 - vec2<u32>( 1, 1 ) ) ) ), u32( 0 ) );
	nodeVar4 = ( ( object.nodeUniform8 * object.nodeUniform9 ) / ( ( ( object.nodeUniform9 - object.nodeUniform8 ) * nodeVar2 ) - object.nodeUniform9 ) );
	nodeVar5 = ( - nodeVar4 );
	nodeVar6 = ( vec3<f32>( 0.5, 0.5, 0.5 ) / object.nodeUniform13 );
	nodeVar7 = clamp( ( ( ( ( ( object.nodeUniform4 * vec4<f32>( vec3<f32>( ( ( ( nodeVar1.x * object.nodeUniform6 ) * object.nodeUniform7 ) * nodeVar5 ), ( ( nodeVar1.y * object.nodeUniform6 ) * nodeVar5 ), nodeVar4 ), 1.0 ) ).xyz - object.nodeUniform11 ) / object.nodeUniform12 ) + vec3<f32>( 0.5 ) ) / object.nodeUniform13 ), nodeVar6, ( vec3<f32>( 1.0, 1.0, 1.0 ) - nodeVar6 ) );
	nodeVar8 = textureSample( nodeUniform3, nodeUniform3_sampler, nodeVar7 );
	nodeVar9 = textureSample( nodeUniform15, nodeUniform15_sampler, nodeVarying4 );
	nodeVar10 = normalize( ( object.nodeUniform14 * normalize( nodeVar9.xyz ) ) );
	nodeVar11 = textureSample( nodeUniform16, nodeUniform16_sampler, nodeVar7 );
	nodeVar12 = textureSample( nodeUniform17, nodeUniform17_sampler, nodeVar7 );
	nodeVar13 = textureLoad( nodeUniform10, vec2<u32>( clamp( floor( tsl_coord_clampS_clampT_2d( nodeVarying4 ) * vec2<f32>( nodeVar3 ) ), vec2<f32>( 0 ), vec2<f32>( nodeVar3 - vec2<u32>( 1, 1 ) ) ) ), u32( 0 ) );
	nodeVar14 = nodeVar13;
	nodeVar15 = textureSample( nodeUniform15, nodeUniform15_sampler, nodeVarying4 );
	nodeVar16 = normalize( nodeVar15.xyz );
	nodeVar17 = textureSample( nodeUniform20, nodeUniform20_sampler, nodeVarying4 );
	nodeVar18 = nodeVar17;

	if ( ( ( nodeVar14 >= 1.0 ) || ( dot( nodeVar16, nodeVar16 ) == 0.0 ) ) ) {

		nodeVar19 = nodeVar18;
		

	} else {

		let nodeConst0 = ( ( object.nodeUniform21 * vec4<f32>( vec3<f32>( ( ( vec2<f32>( nodeVarying4.x, ( 1.0 - nodeVarying4.y ) ) * vec2<f32>( 2.0 ) ) - vec2<f32>( 1.0 ) ), nodeVar14 ), 1.0 ) ).xyz / vec3<f32>( ( object.nodeUniform21 * vec4<f32>( vec3<f32>( ( ( vec2<f32>( nodeVarying4.x, ( 1.0 - nodeVarying4.y ) ) * vec2<f32>( 2.0 ) ) - vec2<f32>( 1.0 ) ), nodeVar14 ), 1.0 ) ).w ) );
		nodeVar21 = textureDimensions( nodeUniform22, u32( 0 ) );
		nodeVar20 = textureLoad( nodeUniform22, vec2<u32>( clamp( floor( tsl_coord_repeatS_repeatT_2d( ( object.nodeUniform23 * vec3<f32>( ( vec2<f32>( nodeVarying4.x, ( 1.0 - nodeVarying4.y ) ) * ( object.nodeUniform24 / vec2<f32>( textureDimensions( nodeUniform22, 0 ) ) ) ), 1.0 ) ).xy ) * vec2<f32>( nodeVar21 ) ), vec2<f32>( 0 ), vec2<f32>( nodeVar21 - vec2<u32>( 1, 1 ) ) ) ), u32( 0 ) );
		nodeVar22 = nodeVar20;
		nodeVar23 = 1.0;
		nodeVar24 = nodeVar18.xyz;

		for ( var i : i32 = 0; i < 16; i ++ ) {

			nodeVar25 = vec2<f32>( sin( nodeVar22[ u32( ( ( tsl_mod_float( object.nodeUniform25, 4.0 ) * 2.0 ) * 3.141592653589793 ) ) ] ), cos( nodeVar22[ u32( ( ( tsl_mod_float( object.nodeUniform25, 4.0 ) * 2.0 ) * 3.141592653589793 ) ) ] ) );
			nodeVar26 = ( nodeVarying4 + ( ( mat2x2<f32>( nodeVar25.x, ( - nodeVar25.y ), nodeVar25.x, nodeVar25.y ) * ( NodeBuffer_1941.value[ i ].xyz.xy * vec2<f32>( ( 1.0 + ( NodeBuffer_1941.value[ i ].xyz.z * ( object.nodeUniform27 - 1.0 ) ) ) ) ) ) / object.nodeUniform24 ) );
			nodeVar27 = textureSample( nodeUniform20, nodeUniform20_sampler, nodeVar26 );
			nodeVar28 = nodeVar27;
			nodeVar29 = textureLoad( nodeUniform10, vec2<u32>( clamp( floor( tsl_coord_clampS_clampT_2d( nodeVar26 ) * vec2<f32>( nodeVar3 ) ), vec2<f32>( 0 ), vec2<f32>( nodeVar3 - vec2<u32>( 1, 1 ) ) ) ), u32( 0 ) );
			nodeVar30 = nodeVar29;
			nodeVar31 = textureSample( nodeUniform15, nodeUniform15_sampler, nodeVar26 );
			nodeVar32 = normalize( nodeVar31.xyz );
			nodeVar33 = ( ( object.nodeUniform21 * vec4<f32>( vec3<f32>( ( ( vec2<f32>( nodeVar26.x, ( 1.0 - nodeVar26.y ) ) * vec2<f32>( 2.0 ) ) - vec2<f32>( 1.0 ) ), nodeVar30 ), 1.0 ) ).xyz / vec3<f32>( ( object.nodeUniform21 * vec4<f32>( vec3<f32>( ( ( vec2<f32>( nodeVar26.x, ( 1.0 - nodeVar26.y ) ) * vec2<f32>( 2.0 ) ) - vec2<f32>( 1.0 ) ), nodeVar30 ), 1.0 ) ).w ) );
			nodeVar34 = dot( nodeVar16, nodeVar32 );
			nodeVar35 = pow( max( nodeVar34, 0.0 ), object.nodeUniform28 );
			nodeVar36 = abs( ( dot( nodeVar28.xyz, vec3<f32>( 0.2126, 0.7152, 0.0722 ) ) - dot( nodeVar18.xyz, vec3<f32>( 0.2126, 0.7152, 0.0722 ) ) ) );
			nodeVar37 = max( ( 1.0 - ( nodeVar36 / object.nodeUniform29 ) ), 0.0 );
			nodeVar38 = abs( dot( ( nodeConst0 - nodeVar33 ), nodeVar16 ) );
			nodeVar39 = ( ( nodeVar37 * max( ( 1.0 - ( nodeVar38 / object.nodeUniform30 ) ), 0.0 ) ) * nodeVar35 );
			nodeVar40 = vec4<f32>( ( nodeVar28.xyz * vec3<f32>( nodeVar39 ) ), nodeVar39 );
			nodeVar24 = ( nodeVar24 + nodeVar40.xyz );
			nodeVar23 = ( nodeVar23 + nodeVar40.w );

		}


		if ( ( nodeVar23 > 0.0 ) ) {

			nodeVar24 = ( nodeVar24 / vec3<f32>( nodeVar23 ) );
			

		}

		nodeVar19 = vec4<f32>( nodeVar24, nodeVar18.w );
		

	}

	nodeVar41 = textureSample( nodeUniform33, nodeUniform33_sampler, nodeVarying4 );
	nodeVar42 = textureSampleLevel( nodeUniform32, nodeUniform32_sampler, nodeVarying4, clamp( ( ( nodeVar41.y * nodeVar41.y ) * 4.0 ), 0.0, 4.0 ) );
	nodeVar43 = nodeVar42;
	nodeVar44 = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar45 = ( - nodeVar4 );
	nodeVar46 = ( smoothstep( 0.5, 0.05, clamp( nodeVar41.y, 0.0, 1.0 ) ) * ( step( nodeVar45, 200.0 ) * step( 0.02, nodeVar45 ) ) );

	if ( ( ( object.nodeUniform35 * nodeVar46 ) > 0.001 ) ) {

		nodeVar47 = 1000000.0;
		nodeVar48 = 0.0;

		for ( var i : i32 = 0; i < 24; i ++ ) {

			nodeVar49 = ( i * 4 );

			if ( ( NodeBuffer_1867.value[ nodeVar49 ].w >= 0.0 ) ) {

				nodeVar50 = ( ( ( fragCoord.xy / object.nodeUniform5 ) * vec2<f32>( 2.0 ) ) - vec2<f32>( 1.0 ) );
				nodeVar51 = normalize( ( object.nodeUniform40 * normalize( nodeVar9.xyz ) ) );
				nodeVar52 = ( ( ( object.nodeUniform37 * vec4<f32>( vec3<f32>( ( ( ( nodeVar50.x * object.nodeUniform38 ) * object.nodeUniform39 ) * nodeVar45 ), ( ( nodeVar50.y * object.nodeUniform38 ) * nodeVar45 ), nodeVar4 ), 1.0 ) ).xyz + ( nodeVar51 * vec3<f32>( 0.004 ) ) ) - NodeBuffer_1867.value[ nodeVar49 ].xyz );
				nodeVar53 = cos( NodeBuffer_1867.value[ ( nodeVar49 + 1 ) ].w );
				nodeVar54 = sin( NodeBuffer_1867.value[ ( nodeVar49 + 1 ) ].w );
				nodeVar55 = vec3<f32>( ( ( nodeVar52.x * nodeVar53 ) + ( nodeVar52.z * nodeVar54 ) ), nodeVar52.y, ( ( - ( nodeVar52.x * nodeVar54 ) ) + ( nodeVar52.z * nodeVar53 ) ) );
				nodeVar56 = normalize( reflect( normalize( ( ( object.nodeUniform37 * vec4<f32>( vec3<f32>( ( ( ( nodeVar50.x * object.nodeUniform38 ) * object.nodeUniform39 ) * nodeVar45 ), ( ( nodeVar50.y * object.nodeUniform38 ) * nodeVar45 ), nodeVar4 ), 1.0 ) ).xyz - object.nodeUniform41 ) ), nodeVar51 ) );
				nodeVar57 = vec3<f32>( ( ( nodeVar56.x * nodeVar53 ) + ( nodeVar56.z * nodeVar54 ) ), nodeVar56.y, ( ( - ( nodeVar56.x * nodeVar54 ) ) + ( nodeVar56.z * nodeVar53 ) ) );
				nodeVar58 = ( vec3<f32>( 1.0, 1.0, 1.0 ) / vec3<f32>( ( ( nodeVar57.x + ( sign( nodeVar57.x ) * 0.000001 ) ) + 1e-9 ), ( ( nodeVar57.y + ( sign( nodeVar57.y ) * 0.000001 ) ) + 1e-9 ), ( ( nodeVar57.z + ( sign( nodeVar57.z ) * 0.000001 ) ) + 1e-9 ) ) );
				nodeVar59 = ( ( ( - NodeBuffer_1867.value[ ( nodeVar49 + 1 ) ].xyz ) - nodeVar55 ) * nodeVar58 );
				nodeVar60 = ( ( NodeBuffer_1867.value[ ( nodeVar49 + 1 ) ].xyz - nodeVar55 ) * nodeVar58 );
				nodeVar61 = min( nodeVar59, nodeVar60 );
				nodeVar62 = max( nodeVar59, nodeVar60 );
				nodeVar63 = vec2<f32>( max( max( nodeVar61.x, nodeVar61.y ), nodeVar61.z ), min( min( nodeVar62.x, nodeVar62.y ), nodeVar62.z ) );
				nodeVar64 = ( ( step( 0.001, nodeVar63.x ) * step( nodeVar63.x, nodeVar63.y ) ) * step( nodeVar63.x, nodeVar47 ) );
				nodeVar47 = mix( nodeVar47, nodeVar63.x, nodeVar64 );
				nodeVar48 = mix( nodeVar48, f32( i ), nodeVar64 );
				

			}


		}

		nodeVar65 = ( ( ( fragCoord.xy / object.nodeUniform5 ) * vec2<f32>( 2.0 ) ) - vec2<f32>( 1.0 ) );
		nodeVar66 = normalize( ( object.nodeUniform40 * normalize( nodeVar9.xyz ) ) );
		nodeVar67 = ( ( object.nodeUniform37 * vec4<f32>( vec3<f32>( ( ( ( nodeVar65.x * object.nodeUniform38 ) * object.nodeUniform39 ) * nodeVar45 ), ( ( nodeVar65.y * object.nodeUniform38 ) * nodeVar45 ), nodeVar4 ), 1.0 ) ).xyz + ( nodeVar66 * vec3<f32>( 0.004 ) ) );
		nodeVar68 = normalize( ( ( object.nodeUniform37 * vec4<f32>( vec3<f32>( ( ( ( nodeVar65.x * object.nodeUniform38 ) * object.nodeUniform39 ) * nodeVar45 ), ( ( nodeVar65.y * object.nodeUniform38 ) * nodeVar45 ), nodeVar4 ), 1.0 ) ).xyz - object.nodeUniform41 ) );
		nodeVar69 = normalize( reflect( nodeVar68, nodeVar66 ) );
		nodeVar70 = ( ( nodeVar67 + ( nodeVar69 * vec3<f32>( min( nodeVar47, 100000.0 ) ) ) ) - NodeBuffer_1867.value[ i32( ( nodeVar48 * 4.0 ) ) ].xyz );
		nodeVar71 = cos( NodeBuffer_1867.value[ ( i32( ( nodeVar48 * 4.0 ) ) + 1 ) ].w );
		nodeVar72 = sin( NodeBuffer_1867.value[ ( i32( ( nodeVar48 * 4.0 ) ) + 1 ) ].w );
		nodeVar73 = ( vec3<f32>( ( ( nodeVar70.x * nodeVar71 ) + ( nodeVar70.z * nodeVar72 ) ), nodeVar70.y, ( ( - ( nodeVar70.x * nodeVar72 ) ) + ( nodeVar70.z * nodeVar71 ) ) ) / max( NodeBuffer_1867.value[ ( i32( ( nodeVar48 * 4.0 ) ) + 1 ) ].xyz, vec3<f32>( 0.0001, 0.0001, 0.0001 ) ) );
		nodeVar74 = abs( nodeVar73 );
		nodeVar75 = max( max( nodeVar74.x, nodeVar74.y ), nodeVar74.z );
		nodeVar76 = vec3<f32>( ( step( ( nodeVar75 - 0.0001 ), nodeVar74.x ) * sign( nodeVar73.x ) ), ( step( ( nodeVar75 - 0.0001 ), nodeVar74.y ) * sign( nodeVar73.y ) ), ( step( ( nodeVar75 - 0.0001 ), nodeVar74.z ) * sign( nodeVar73.z ) ) );
		nodeVar77 = normalize( vec3<f32>( ( ( nodeVar76.x * nodeVar71 ) - ( nodeVar76.z * nodeVar72 ) ), nodeVar76.y, ( ( nodeVar76.x * nodeVar72 ) + ( nodeVar76.z * nodeVar71 ) ) ) );
		nodeVar78 = 1.0;

		for ( var i : i32 = 0; i < 24; i ++ ) {

			nodeVar79 = ( i * 4 );

			if ( ( NodeBuffer_1867.value[ nodeVar79 ].w >= 0.0 ) ) {

				nodeVar80 = ( ( ( nodeVar67 + ( nodeVar69 * vec3<f32>( min( nodeVar47, 100000.0 ) ) ) ) + ( nodeVar77 * vec3<f32>( 0.004 ) ) ) - NodeBuffer_1867.value[ nodeVar79 ].xyz );
				nodeVar81 = cos( NodeBuffer_1867.value[ ( nodeVar79 + 1 ) ].w );
				nodeVar82 = sin( NodeBuffer_1867.value[ ( nodeVar79 + 1 ) ].w );
				nodeVar83 = vec3<f32>( ( ( nodeVar80.x * nodeVar81 ) + ( nodeVar80.z * nodeVar82 ) ), nodeVar80.y, ( ( - ( nodeVar80.x * nodeVar82 ) ) + ( nodeVar80.z * nodeVar81 ) ) );
				nodeVar84 = vec3<f32>( ( ( object.nodeUniform43.x * nodeVar81 ) + ( object.nodeUniform43.z * nodeVar82 ) ), object.nodeUniform43.y, ( ( - ( object.nodeUniform43.x * nodeVar82 ) ) + ( object.nodeUniform43.z * nodeVar81 ) ) );
				nodeVar85 = ( vec3<f32>( 1.0, 1.0, 1.0 ) / vec3<f32>( ( ( nodeVar84.x + ( sign( nodeVar84.x ) * 0.000001 ) ) + 1e-9 ), ( ( nodeVar84.y + ( sign( nodeVar84.y ) * 0.000001 ) ) + 1e-9 ), ( ( nodeVar84.z + ( sign( nodeVar84.z ) * 0.000001 ) ) + 1e-9 ) ) );
				nodeVar86 = ( ( ( - NodeBuffer_1867.value[ ( nodeVar79 + 1 ) ].xyz ) - nodeVar83 ) * nodeVar85 );
				nodeVar87 = ( ( NodeBuffer_1867.value[ ( nodeVar79 + 1 ) ].xyz - nodeVar83 ) * nodeVar85 );
				nodeVar88 = min( nodeVar86, nodeVar87 );
				nodeVar89 = max( nodeVar86, nodeVar87 );
				nodeVar90 = vec2<f32>( max( max( nodeVar88.x, nodeVar88.y ), nodeVar88.z ), min( min( nodeVar89.x, nodeVar89.y ), nodeVar89.z ) );
				nodeVar78 = ( nodeVar78 * ( 1.0 - ( ( step( 0.001, nodeVar90.x ) * step( nodeVar90.x, nodeVar90.y ) ) * mix( 1.0, 0.28, ( step( NodeBuffer_1867.value[ ( nodeVar79 + 3 ) ].x, 0.06 ) * object.nodeUniform44 ) ) ) ) );
				

			}


		}

		nodeVar91 = mix( ( NodeBuffer_1867.value[ ( i32( ( nodeVar48 * 4.0 ) ) + 2 ) ].xyz * ( ( ( object.nodeUniform42 * vec3<f32>( clamp( dot( nodeVar77, object.nodeUniform43 ), 0.0, 1.0 ) ) ) * vec3<f32>( clamp( nodeVar78, 0.0, 1.0 ) ) ) + ( object.nodeUniform45 * vec3<f32>( 0.35 ) ) ) ), ( mix( object.nodeUniform46, object.nodeUniform45, clamp( ( ( nodeVar69.y * 0.5 ) + 0.5 ), 0.0, 1.0 ) ) + ( object.nodeUniform42 * vec3<f32>( smoothstep( 0.9986, 0.9999, clamp( dot( nodeVar69, object.nodeUniform43 ), 0.0, 1.0 ) ) ) ) ), ( 1.0 - step( nodeVar47, 100000.0 ) ) );
		nodeVar92 = mix( vec3<f32>( 0.04, 0.04, 0.04 ), nodeVar0.xyz, ( clamp( nodeVar41.x, 0.0, 1.0 ) * ( 1.0 - clamp( max( ( step( abs( nodeVar66.y ), 0.34 ) * step( ( ( object.nodeUniform37 * vec4<f32>( vec3<f32>( ( ( ( nodeVar65.x * object.nodeUniform38 ) * object.nodeUniform39 ) * nodeVar45 ), ( ( nodeVar65.y * object.nodeUniform38 ) * nodeVar45 ), nodeVar4 ), 1.0 ) ).xyz.y - object.nodeUniform47 ), 3.2 ) ), step( 0.94, nodeVar66.y ) ), 0.0, 1.0 ) ) ) );
		nodeVar93 = ( nodeVar92 + ( ( vec3<f32>( 1.0, 1.0, 1.0 ) - nodeVar92 ) * vec3<f32>( pow( ( 1.0 - clamp( dot( nodeVar66, ( - nodeVar68 ) ), 0.0, 1.0 ) ), 5.0 ) ) ) );
		nodeVar94 = ( ( ( nodeVar91 * nodeVar93 ) * vec3<f32>( nodeVar46 ) ) * vec3<f32>( object.nodeUniform35 ) );
		nodeVar44 = ( nodeVar94 * vec3<f32>( min( 1.0, ( min( object.nodeUniform48, max( ( dot( nodeVar0.xyz, vec3<f32>( 0.2126, 0.7152, 0.0722 ) ) * object.nodeUniform49 ), 0.00001 ) ) / max( max( max( nodeVar94.x, nodeVar94.y ), nodeVar94.z ), 0.00001 ) ) ) ) );
		

	}

	nodeVar95 = textureSample( nodeUniform50, nodeUniform50_sampler, nodeVarying4 );
	nodeVar96 = nodeVar95;
	nodeVar97 = ( vec2<f32>( 1.0, 1.0 ) / object.nodeUniform5 );
	nodeVar98 = textureLoad( nodeUniform10, vec2<u32>( clamp( floor( tsl_coord_clampS_clampT_2d( ( ( fragCoord.xy / object.nodeUniform5 ) + vec2<f32>( nodeVar97.x, 0.0 ) ) ) * vec2<f32>( nodeVar3 ) ), vec2<f32>( 0 ), vec2<f32>( nodeVar3 - vec2<u32>( 1, 1 ) ) ) ), u32( 0 ) );
	nodeVar99 = textureLoad( nodeUniform10, vec2<u32>( clamp( floor( tsl_coord_clampS_clampT_2d( ( ( fragCoord.xy / object.nodeUniform5 ) + vec2<f32>( 0.0, nodeVar97.y ) ) ) * vec2<f32>( nodeVar3 ) ), vec2<f32>( 0 ), vec2<f32>( nodeVar3 - vec2<u32>( 1, 1 ) ) ) ), u32( 0 ) );
	nodeVar100 = ( 1.0 - smoothstep( 0.00035, 0.0035, max( abs( ( nodeVar2 - nodeVar98 ) ), abs( ( nodeVar2 - nodeVar99 ) ) ) ) );
	nodeVar101 = textureSample( nodeUniform51, nodeUniform51_sampler, nodeVarying4 );
	nodeVar102 = nodeVar101;
	nodeVar103 = vec4<f32>( ( ( ( ( ( ( ( ( mix( vec3<f32>( dot( nodeVar0.xyz, vec3<f32>( 0.2126, 0.7152, 0.0722 ) ) ), nodeVar0.xyz, object.nodeUniform1 ) - vec3<f32>( 0.5 ) ) * vec3<f32>( object.nodeUniform2 ) ) + vec3<f32>( 0.5 ) ) + min( ( ( ( clamp( ( nodeVar0.xyz / vec3<f32>( max( dot( nodeVar0.xyz, vec3<f32>( 0.2126, 0.7152, 0.0722 ) ), 0.04 ) ) ), vec3<f32>( 0.0 ), vec3<f32>( 1.6 ) ) * vec3<f32>( max( 0.0, ( ( ( nodeVar8.x * 0.886227677335 ) + ( ( ( ( nodeVar10.y * nodeVar8.y ) + ( nodeVar10.z * nodeVar8.z ) ) + ( nodeVar10.x * nodeVar8.w ) ) * 1.023327680185 ) ) / 3.141592653589793 ) ), max( 0.0, ( ( ( nodeVar11.x * 0.886227677335 ) + ( ( ( ( nodeVar10.y * nodeVar11.y ) + ( nodeVar10.z * nodeVar11.z ) ) + ( nodeVar10.x * nodeVar11.w ) ) * 1.023327680185 ) ) / 3.141592653589793 ) ), max( 0.0, ( ( ( nodeVar12.x * 0.886227677335 ) + ( ( ( ( nodeVar10.y * nodeVar12.y ) + ( nodeVar10.z * nodeVar12.z ) ) + ( nodeVar10.x * nodeVar12.w ) ) * 1.023327680185 ) ) / 3.141592653589793 ) ) ) ) * vec3<f32>( object.nodeUniform18 ) ) * vec3<f32>( ( step( nodeVar5, 220.0 ) * step( 0.02, nodeVar5 ) ) ) ), ( vec3<f32>( 1.0, 1.0, 1.0 ) * vec3<f32>( object.nodeUniform19 ) ) ) ) * vec3<f32>( mix( 1.0, nodeVar19.x, object.nodeUniform31 ) ) ) + ( ( nodeVar43.xyz * vec3<f32>( object.nodeUniform34 ) ) + nodeVar44 ) ) + ( nodeVar96.xyz * vec3<f32>( nodeVar100 ) ) ) + ( ( vec3<f32>( nodeVar102.x ) * object.nodeUniform52 ) * vec3<f32>( nodeVar100 ) ) ), nodeVar0.w );
	nodeVar104 = pow( max( ( ( nodeVar103.xyz * object.nodeUniform53 ) + object.nodeUniform54 ), vec3<f32>( 0.0 ) ), object.nodeUniform55 );
	nodeVar105 = mix( nodeVar104, ( vec3<f32>( ( nodeVar104.y + nodeVar104.z ), ( nodeVar104.x + nodeVar104.z ), ( nodeVar104.x + nodeVar104.y ) ) * vec3<f32>( 0.5 ) ), object.nodeUniform56 );
	nodeVar106 = dot( nodeVar105, vec3<f32>( 0.2126, 0.7152, 0.0722 ) );
	nodeVar107 = max( ( object.nodeUniform58 - object.nodeUniform57 ), 0.0001 );
	nodeVar108 = vec4<f32>( ( mix( nodeVar105, vec3<f32>( nodeVar106 ), ( smoothstep( object.nodeUniform57, object.nodeUniform58, nodeVar106 ) * object.nodeUniform59 ) ) * vec3<f32>( ( ( ( min( nodeVar106, object.nodeUniform57 ) + ( nodeVar107 * pow( clamp( ( ( nodeVar106 - object.nodeUniform57 ) / nodeVar107 ), 0.0, 1.0 ), object.nodeUniform60 ) ) ) + max( ( nodeVar106 - object.nodeUniform58 ), 0.0 ) ) / max( nodeVar106, 0.00001 ) ) ) ), nodeVar103.w );
	nodeVar109 = fn1( vec4<f32>( nodeVar108.xyz, clamp( nodeVar108.w, 0.0, 1.0 ) ) );
	nodeVar110 = vec4<f32>( acesFilmicToneMapping( nodeVar109.xyz, render.nodeUniform61 ), nodeVar109.w );
	nodeVar111 = fn0( vec4<f32>( sRGBTransferOETF( nodeVar110.xyz ), nodeVar110.w ) );
	nodeVar112 = ( nodeVar111.xyz + vec3<f32>( ( ( object.nodeUniform62 * object.nodeUniform63 ) * ( 1.0 - smoothstep( 0.0, object.nodeUniform64, dot( nodeVar111.xyz, vec3<f32>( 0.2126, 0.7152, 0.0722 ) ) ) ) ) ) );
	nodeVar113 = ( dot( nodeVar112, vec3<f32>( 0.2126, 0.7152, 0.0722 ) ) - object.nodeUniform65 );
	nodeVar114 = max( object.nodeUniform67, 0.0001 );
	nodeVar115 = max( ( ( ( nodeVar112 - vec3<f32>( object.nodeUniform65 ) ) * vec3<f32>( ( 1.0 + ( object.nodeUniform66 * exp( ( - ( ( nodeVar113 * nodeVar113 ) / ( ( nodeVar114 * nodeVar114 ) * 2.0 ) ) ) ) ) ) ) ) + vec3<f32>( object.nodeUniform65 ) ), vec3<f32>( 0.0 ) );
	nodeVar116 = dot( nodeVar115, vec3<f32>( 0.2126, 0.7152, 0.0722 ) );
	nodeVar117 = ( ( nodeVar115 * mix( vec3<f32>( 1.0, 1.0, 1.0 ), object.nodeUniform68, ( ( ( 1.0 - smoothstep( 0.0, object.nodeUniform69, nodeVar116 ) ) * object.nodeUniform70 ) * 0.18 ) ) ) * mix( vec3<f32>( 1.0, 1.0, 1.0 ), object.nodeUniform71, ( ( smoothstep( object.nodeUniform72, 1.0, nodeVar116 ) * object.nodeUniform70 ) * 0.18 ) ) );
	nodeVar118 = ( ( fragCoord.xy / object.nodeUniform5 ) - vec2<f32>( 0.5 ) );

	// result

	output.color = vec4<f32>( max( ( ( ( nodeVar117 * vec3<f32>( ( nodeVar116 / max( dot( nodeVar117, vec3<f32>( 0.2126, 0.7152, 0.0722 ) ), 0.00001 ) ) ) ) * vec3<f32>( ( 1.0 - ( ( smoothstep( 0.12, 0.5, dot( nodeVar118, nodeVar118 ) ) * object.nodeUniform73 ) * 0.42 ) ) ) ) + vec3<f32>( ( ( ( fract( ( sin( dot( ( ( ( fragCoord.xy / object.nodeUniform5 ) * object.nodeUniform5 ) + vec2<f32>( object.nodeUniform74 ) ), vec2<f32>( 12.9898, 78.233 ) ) ) * 43758.5453 ) ) - 0.5 ) * 2.0 ) * object.nodeUniform75 ) ) ), vec3<f32>( 0.0 ) ), nodeVar111.w );

	return output;

}
