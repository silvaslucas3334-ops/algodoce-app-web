import Image from 'next/image'

interface OluquinhasLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  variant?: 'rosto' | 'oluquinhas'
  color?: 'branco' | 'marrom'
}

const sizeMap = {
  xs: { width: 32, height: 32 },
  sm: { width: 48, height: 48 },
  md: { width: 80, height: 80 },
  lg: { width: 128, height: 128 },
}

const svgMap: Record<string, Record<string, string>> = {
  rosto: {
    branco: '/rosto_branco.svg',
    marrom: '/rosto_marrom.svg',
  },
  oluquinhas: {
    branco: '/oluquinha_branco.svg',
    marrom: '/oluquinhas_marrom.svg',
  },
}

export default function OluquinhasLogo({
  size = 'md',
  className = '',
  variant = 'rosto',
  color = 'branco',
}: OluquinhasLogoProps) {
  const dimensions = sizeMap[size]
  const svgSrc = svgMap[variant]?.[color] || svgMap.rosto.branco

  return (
    <div className={`relative ${className}`} style={{ width: dimensions.width, height: dimensions.height }}>
      <Image
        src={svgSrc}
        alt="Oluquinhas"
        fill
        className="object-contain"
        priority
      />
    </div>
  )
}
