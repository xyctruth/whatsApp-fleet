package service

import (
	"fmt"
	"sync"
)

// PortPool 端口池管理器
type PortPool struct {
	startPort int
	endPort   int
	used      map[int]bool
	mutex     sync.Mutex
}

// NewPortPool 创建端口池
func NewPortPool(startPort, endPort int) *PortPool {
	return &PortPool{
		startPort: startPort,
		endPort:   endPort,
		used:      make(map[int]bool),
	}
}

// Allocate 分配一个可用端口
func (p *PortPool) Allocate() (int, error) {
	p.mutex.Lock()
	defer p.mutex.Unlock()

	for port := p.startPort; port <= p.endPort; port++ {
		if !p.used[port] {
			p.used[port] = true
			return port, nil
		}
	}

	return 0, fmt.Errorf("no available ports in range %d-%d", p.startPort, p.endPort)
}

// Release 释放端口
func (p *PortPool) Release(port int) {
	p.mutex.Lock()
	defer p.mutex.Unlock()

	delete(p.used, port)
}

// Reserve 预留端口（用于恢复已分配的端口）
func (p *PortPool) Reserve(port int) {
	p.mutex.Lock()
	defer p.mutex.Unlock()

	if port >= p.startPort && port <= p.endPort {
		p.used[port] = true
	}
}

// IsUsed 检查端口是否已被使用
func (p *PortPool) IsUsed(port int) bool {
	p.mutex.Lock()
	defer p.mutex.Unlock()

	return p.used[port]
}

// GetUsedPorts 获取已使用的端口列表
func (p *PortPool) GetUsedPorts() []int {
	p.mutex.Lock()
	defer p.mutex.Unlock()

	var ports []int
	for port := range p.used {
		ports = append(ports, port)
	}

	return ports
}

// GetAvailableCount 获取可用端口数量
func (p *PortPool) GetAvailableCount() int {
	p.mutex.Lock()
	defer p.mutex.Unlock()

	total := p.endPort - p.startPort + 1
	return total - len(p.used)
}
