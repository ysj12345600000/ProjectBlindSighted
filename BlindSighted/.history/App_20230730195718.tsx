import React, { useState, useEffect, createContext, useContext, SetStateAction, Dispatch } from 'react';

import { FlatList, Button, View, Text, StyleSheet, Alert, NativeModules  } from 'react-native';
import { useBleManager, BleManagerContextProvider } from './BleOpeartion';
import {triangulationCalculater, DsitanceCalculateParams} from './triangulationCalculater';
// import  { OrientationCalculaterProvider, orientationCalculater } from './OrientationCalculater';
// import { magnetometerCalculater, MagnetometerCalculaterProvider } from './magnetometerCalculater'


interface DeviceInfoDisp {
  id: string;
  name: string | null;
  rssi : number | null;
  // 在这里添加更多的设备属性
}

const ContextApp = () => {
  const { 
    getServiceID,
    startNoticeBle,
    setDistanceCalculateParamsList, 
    distanceCalculateParamsList, 
    rssiLists, 
    bleWirte, 
    setAllowRssiScan, 
    connectedDevices, 
    isSearchBle, 
    targetMacIds, 
    startSearchBle, 
    stopSearchBle, 
    deviceList, 
    requestPermissions,  
    connectBle, 
    setTargetMacIds,} = useBleManager();
  const [ calculateForDistance, setCalculateForDistance ] = useState(false); //估计距离
  const { calculateDistances, getUsersPosition, angleDifference } = triangulationCalculater();
  const [ userPosition, setUserPosition ] = useState([0,0]);

  // const { setAllowNotifyOrientation, heading, allowNotifyOrientation } = orientationCalculater();
  // const { setSubscribeheading, setAccelerometerAvailable, setMagnetometerAvailable, heading, subscribeheading, accelerometerAvailable, magnetometerAvailable } = magnetometerCalculater();

  // 当组件加载时请求蓝牙权限
  useEffect(() => {
    setTargetMacIds(['34:85:18:6E:5B:19','34:85:18:42:4E:39','34:85:18:6E:D4:C5'])
    requestPermissions((granted: boolean) => {
      if (!granted) {
        Alert.alert('Permission Required', 'This app needs bluetooth permissions to function properly');
      }
    });
  }, [requestPermissions]);

  // 当设备列表更新时，自动连接设备
  useEffect(() => {
    const connectDevices = async () => {
        if (deviceList.length === 0 || targetMacIds.length === 0) return;

        const matchingDevices = deviceList.filter(device => targetMacIds.includes(device.id));

        for (const device of matchingDevices) {
            await connectBle(device.id);
        }
    };

    connectDevices();
  }, [deviceList]);

  useEffect(() => {
    if (!calculateForDistance) return;
  
    // 检查是否有足够的设备连接
    if (connectedDevices.length < 3) {
      console.log('设备数量不足，无法计算距离');
      return;
    }
  
    // 检查设备信息是否完整
    if (distanceCalculateParamsList.length < 3) {
      handleIncompleteDeviceInformation();
      return;
    }
  
    // 开始RSSI扫描并进行距离计算
    startRssiScanAndDistanceCalculation();
  
  }, [calculateForDistance, rssiLists, distanceCalculateParamsList, connectedDevices]);
  
 /**
 * 处理不完整的设备信息。
 */
  const handleIncompleteDeviceInformation = () => {
    console.log('设备信息数量不足，无法计算距离');


    // 使用异步自执行函数逐个处理缺失的Mac IDs
    (async () => {
        const macId = connectedDevices[0].id;
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
        await getServiceID(macId);
        await startNoticeBle(macId);
        await bleWirte(macId, 'GETDEVICEINFO');
    })();
}

  /**
   * 开始RSSI扫描并进行距离计算。
   */
  const startRssiScanAndDistanceCalculation = () => {
    setAllowRssiScan(true);

    if (!allRssiListsHaveMinimumData()) return;

    let distanceCalculateParamsListCopy = [...distanceCalculateParamsList];
    assignRssiData(distanceCalculateParamsListCopy);
    calculateDistancesAndSetPosition(distanceCalculateParamsListCopy);
}

  const allRssiListsHaveMinimumData = () => 
  rssiLists.every(list => list.length >= 50);

  const assignRssiData = (paramsList : DsitanceCalculateParams[]) => {
    for (let k = 0; k < 3; k++) {
        const parts = paramsList[k].deviceName.split('_');
        const index = parseInt(parts[parts.length - 1], 10)-1;

        console.log('设备名称', paramsList[k].deviceName, '设备序号', index);
        if (!rssiLists[index]) {
            console.error(`RSSI list at index ${index} is not defined`);
            console.log('RSSI lists', rssiLists);
            continue;
        }
        paramsList[k].rssiList = rssiLists[index];
    }
};

  const calculateDistancesAndSetPosition = async (paramsList : DsitanceCalculateParams[]) => {
    const updatedParamsList = await calculateDistances(paramsList);
    const position = await getUsersPosition(updatedParamsList, 0);

    if (!position) return;

    console.log('用户位置', position);
    setUserPosition(position);
    setCalculateForDistance(false);
    setAllowRssiScan(false);
  }

  //渲染扫描的设备列表
  const renderDeviceInfoDisp= ( {item}: {item: DeviceInfoDisp}) => {

    let displayName = item.name;
    if (!displayName) {
      displayName = 'Unknown Device';
    }

    return (
      <View style={[styles.itemContainer, {alignItems: 'center'}]}>
      <View style={{flexDirection: 'column', alignItems: 'center'}}>

        <Text style={styles.itemText}>设备名称: {displayName}</Text>

        <Text style={styles.itemText}>设备ID: {item.id}</Text>

        <Text style={styles.itemText}>RSSI: {item.rssi} dB</Text>
      
      </View>
    </View>
      );
  };

  const notice = () => {
    console.log('目前连接的设备', connectedDevices);
  };

  const getCompassDirection = async () => {
    try {
      NativeModules.CompassModule.getDirection((direction : number) => {

        // while(direction < 0) {
        //   direction += 360;
        // }
        // if(direction > 360) {
        //   direction = direction%360;
        // }
        // if(direction > 180) {
        //   direction = direction - 360;
        // }
        console.log('Direction:', direction, direction);

        // 北方向为0度, 左转为增大, 右转为减小
      });
    } catch (error) {
      console.error(error);
    }
  }

  const testCalculateorientation = async () => {
    let paramList = distanceCalculateParamsList;
    const angle_ = 17;
    paramList[0].angle = angle_;
    paramList[1].angle = angle_;
    paramList[2].angle = angle_;
    console.log('paramList',paramList);
    const angle = await angleDifference(distanceCalculateParamsList,{x:3,y:-3})
  }


  return (
    <View style={styles.container}>
      <Button title="Scan Devices" color={isSearchBle? 'red': 'blue'}onPress={isSearchBle? stopSearchBle:startSearchBle} />
      <Button title="当前连接设备" color='orange' onPress={notice} />
      <Button title="获取RSSI值" color='green' onPress={()=>{setAllowRssiScan(true)}} />
      <Button title="发送信息" color='green' onPress={()=>{bleWirte(connectedDevices[0].id, "")}} />
      {calculateForDistance? <Button title="停止计算位置" color='red' onPress={()=>{setCalculateForDistance(false)}} />: <Button title="计算位置" color='pink' onPress={()=>{setCalculateForDistance(true)}} />}
      {/* <Button title="获取角度" color='orange' onPress={()=>setAllowNotifyOrientation(!allowNotifyOrientation)} /> */}
      <Button title="获取角度"color='orange' onPress={()=>
        {
          testCalculateorientation();
        }
        } />
      {/* <Text>用户方向:{heading}</Text> */}
      <FlatList
        data={connectedDevices}
        renderItem={renderDeviceInfoDisp}
        keyExtractor={(item, index) => index.toString()}
      />
    </View>
  );

};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  itemText: {
    fontSize: 16,
    color: '#000', // 添加这行，确保文字颜色为黑色
  },
});

const App = () => {
  return (
    <BleManagerContextProvider>
      {/* <MagnetometerCalculaterProvider> */}
      {/* <OrientationCalculaterProvider> */}
      <ContextApp />
      {/* </OrientationCalculaterProvider> */}
      {/* </MagnetometerCalculaterProvider> */}
    </BleManagerContextProvider>
  );
}

export default App;

